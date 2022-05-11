import { Algorithm } from '@antv/g6';
import { Canvas, CanvasEvent } from '@antv/g';
import { Renderer } from '@antv/g-webgpu';
import { Plugin, Kernel, BufferUsage } from '@antv/g-plugin-gpgpu';

/**
 * Pagerank with power method, ported from CUDA
 * @see https://github.com/princeofpython/PageRank-with-CUDA/blob/main/parallel.cu
 *
 * compared with G6:
 * @see https://g6.antv.vision/zh/docs/api/Algorithm#pagerank
 */

/**
 * use Compressed Sparse Row (CSR) for adjacency list
 */
// datasource: https://github.com/sengorajkumar/gpu_graph_algorithms/blob/master/input/simple.gr_E.csv
const V = [0, 1, 2, 3, 4];
const E = [1, 2, 2, 3, 4, 3, 4, 1, 3];
const I = [0, 2, 5, 7, 8, 10];
const W = [9, 4, 10, 2, 3, 2, 11, 2, 2];
const From = [0, 0, 1, 1, 1, 2, 2, 3, 4];
const To = [1, 2, 2, 3, 4, 3, 4, 1, 3];
const BLOCK_SIZE = 1;
const BLOCKS = 5;

const CANVAS_SIZE = 1;

const $wrapper = document.getElementById('container');
const $text = document.createElement('div');
$text.textContent = 'Please open the devtools, the top nodes will be printed in console.';
$wrapper.appendChild($text);

// use WebGPU
const renderer = new Renderer();
renderer.registerPlugin(new Plugin());

// create a canvas
const canvas = new Canvas({
  container: $wrapper,
  width: CANVAS_SIZE,
  height: CANVAS_SIZE,
  renderer,
});

canvas.addEventListener(CanvasEvent.READY, () => {
  const plugin = renderer.getPlugin('device-renderer');
  const device = plugin.getDevice();
  const storeKernel = new Kernel(device, {
    computeShader: `
struct Buffer {
  data: array<f32>;
};

@group(0) @binding(0) var<storage, read> r : Buffer;
@group(0) @binding(1) var<storage, write> r_last : Buffer;

@stage(compute) @workgroup_size(${BLOCKS}, ${BLOCK_SIZE})
fn main(
  @builtin(global_invocation_id) global_id : vec3<u32>
) {
  var index = global_id.x;
  if (index < ${V.length}u) {
    r_last.data[index] = r.data[index];
  }
}`,
  });

  const matmulKernel = new Kernel(device, {
    computeShader: `
struct Buffer {
  data: array<f32>;
};

@group(0) @binding(0) var<storage, read> graph : Buffer;
@group(0) @binding(1) var<storage, read_write> r : Buffer;
@group(0) @binding(2) var<storage, read> r_last : Buffer;

@stage(compute) @workgroup_size(${BLOCKS}, ${BLOCK_SIZE})
fn main(
  @builtin(global_invocation_id) global_id : vec3<u32>
) {
  var index = global_id.x;
  if (index < ${V.length}u) {
    var sum = 0.0;
    for (var i = 0u; i < ${V.length}u; i = i + 1u) {
      sum = sum + r_last.data[i] * graph.data[index * ${V.length}u + i];
    }
    r.data[index] = sum;
  }
}
    `,
  });

  const rankDiffKernel = new Kernel(device, {
    computeShader: `
struct Buffer {
  data: array<f32>;
};

@group(0) @binding(0) var<storage, read> r : Buffer;
@group(0) @binding(1) var<storage, read_write> r_last : Buffer;

@stage(compute) @workgroup_size(${BLOCKS}, ${BLOCK_SIZE})
fn main(
  @builtin(global_invocation_id) global_id : vec3<u32>
) {
  var index = global_id.x;
  if (index < ${V.length}u) {
    r_last.data[index] = abs(r_last.data[index] - r.data[index]);
  }
}    
    `,
  });

  pageRankGPU(device, storeKernel, matmulKernel, rankDiffKernel);
});

const pageRankGPU = async (device, storeKernel, matmulKernel, rankDiffKernel) => {
  const d = 0.85;
  const eps = 0.000001;
  let maxIteration = 1000;
  const n = V.length;
  const graph = new Float32Array(new Array(n * n).fill((1 - d) / n));
  const r = new Float32Array(new Array(n).fill(1 / n));

  From.forEach((from, i) => {
    graph[To[i] * n + from] += d * 1.0;
  });

  for (let j = 0; j < n; j++) {
    let sum = 0.0;

    for (let i = 0; i < n; ++i) {
      sum += graph[i * n + j];
    }

    for (let i = 0; i < n; ++i) {
      if (sum != 0.0) {
        graph[i * n + j] /= sum;
      } else {
        graph[i * n + j] = 1 / n;
      }
    }
  }

  const rBuffer = device.createBuffer({
    usage: BufferUsage.STORAGE | BufferUsage.COPY_SRC,
    viewOrSize: new Float32Array(r),
  });
  const rLastBuffer = device.createBuffer({
    usage: BufferUsage.STORAGE | BufferUsage.COPY_SRC,
    viewOrSize: new Float32Array(n),
  });
  const graphBuffer = device.createBuffer({
    usage: BufferUsage.STORAGE,
    viewOrSize: new Float32Array(graph),
  });

  const readback = device.createReadback();

  storeKernel.setBinding(0, rBuffer);
  storeKernel.setBinding(1, rLastBuffer);

  matmulKernel.setBinding(0, graphBuffer);
  matmulKernel.setBinding(1, rBuffer);
  matmulKernel.setBinding(2, rLastBuffer);

  rankDiffKernel.setBinding(0, rBuffer);
  rankDiffKernel.setBinding(1, rLastBuffer);

  const startTime = window.performance.now();
  while (maxIteration--) {
    storeKernel.dispatch(1, 1);

    matmulKernel.dispatch(1, 1);

    rankDiffKernel.dispatch(1, 1);

    const last = await readback.readBuffer(rLastBuffer);
    const result = last.reduce((prev, cur) => prev + cur, 0);
    if (result < eps) {
      const out = await readback.readBuffer(rBuffer);
      console.log(out);
      break;
    }
  }

  console.log(`GPU Time Elapsed: ${window.performance.now() - startTime}ms`);
};

const { pageRank } = Algorithm;
const data = {
  nodes: [
    {
      id: 'A',
      label: 'A',
    },
    {
      id: 'B',
      label: 'B',
    },
    {
      id: 'C',
      label: 'C',
    },
    {
      id: 'D',
      label: 'D',
    },
    {
      id: 'E',
      label: 'E',
    },
  ],
  edges: [
    {
      source: 'A',
      target: 'B',
    },
    {
      source: 'A',
      target: 'C',
    },
    {
      source: 'B',
      target: 'C',
    },
    {
      source: 'B',
      target: 'D',
    },
    {
      source: 'B',
      target: 'E',
    },
    {
      source: 'C',
      target: 'D',
    },
    {
      source: 'C',
      target: 'E',
    },
    {
      source: 'D',
      target: 'B',
    },
    {
      source: 'E',
      target: 'D',
    },
  ],
};

const startTime = window.performance.now();
const result = pageRank(data);
console.log(result);
console.log(`CPU Time Elapsed: ${window.performance.now() - startTime}ms`);

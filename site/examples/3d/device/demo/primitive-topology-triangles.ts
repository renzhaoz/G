import { WebGLDeviceContribution } from '@antv/g-plugin-webgl-device';
import { WebGPUDeviceContribution } from '@antv/g-plugin-webgpu-device';
import {
  VertexStepMode,
  Format,
  TransparentWhite,
  BufferUsage,
  BufferFrequencyHint,
  TextureUsage,
} from '@antv/g-plugin-device-renderer';
import * as lil from 'lil-gui';

const deviceContributionWebGL1 = new WebGLDeviceContribution({
  targets: ['webgl1'],
  onContextCreationError: () => {},
  onContextLost: () => {},
  onContextRestored(e) {},
});
const deviceContributionWebGL2 = new WebGLDeviceContribution({
  targets: ['webgl2', 'webgl1'],
  onContextCreationError: () => {},
  onContextLost: () => {},
  onContextRestored(e) {},
});
const deviceContributionWebGPU = new WebGPUDeviceContribution(
  {
    shaderCompilerPath: '/glsl_wgsl_compiler_bg.wasm',
  },
  // @ts-ignore
  {
    globalThis: window,
  },
);

const $container = document.getElementById('container')!;
const $canvasContainer = document.createElement('div');
$canvasContainer.id = 'canvas';
$container.appendChild($canvasContainer);

async function render(
  deviceContribution: WebGLDeviceContribution | WebGPUDeviceContribution,
) {
  $canvasContainer.innerHTML = '';
  const $canvas = document.createElement('canvas');
  $canvas.width = 1000;
  $canvas.height = 1000;
  $canvas.style.width = '500px';
  $canvas.style.height = '500px';
  $canvasContainer.appendChild($canvas);

  // create swap chain and get device
  const swapChain = await deviceContribution.createSwapChain($canvas);

  // TODO: resize
  swapChain.configureSwapChain($canvas.width, $canvas.height);
  const device = swapChain.getDevice();

  const program = device.createProgram({
    vertex: {
      glsl: `
layout(location = 0) in vec2 a_Position;

void main() {
  gl_Position = vec4(a_Position, 0.0, 1.0);
} 
`,
    },
    fragment: {
      glsl: `
out vec4 outputColor;

void main() {
  outputColor = vec4(1.0, 0.0, 0.0, 1.0);
}
`,
    },
  });

  const vertexBuffer = device.createBuffer({
    viewOrSize: new Float32Array([0, 0.5, -0.5, -0.5, 0.5, -0.5]),
    usage: BufferUsage.VERTEX,
    hint: BufferFrequencyHint.DYNAMIC,
  });
  device.setResourceName(vertexBuffer, 'a_Position');

  const inputLayout = device.createInputLayout({
    vertexBufferDescriptors: [
      {
        byteStride: 4 * 2,
        stepMode: VertexStepMode.VERTEX,
      },
    ],
    vertexAttributeDescriptors: [
      {
        location: 0,
        bufferIndex: 0,
        bufferByteOffset: 0,
        format: Format.F32_RG,
      },
    ],
    indexBufferFormat: null,
    program,
  });

  const pipeline = device.createRenderPipeline({
    inputLayout,
    program,
    colorAttachmentFormats: [Format.U8_RGBA_RT],
  });

  const renderTarget = device.createRenderTargetFromTexture(
    device.createTexture({
      pixelFormat: Format.U8_RGBA_RT,
      width: $canvas.width,
      height: $canvas.height,
      usage: TextureUsage.RENDER_TARGET,
    }),
  );
  device.setResourceName(renderTarget, 'Main Render Target');

  let id;
  const frame = () => {
    /**
     * An application should call getCurrentTexture() in the same task that renders to the canvas texture.
     * Otherwise, the texture could get destroyed by these steps before the application is finished rendering to it.
     */
    const onscreenTexture = swapChain.getOnscreenTexture();

    const renderPass = device.createRenderPass({
      colorAttachment: [renderTarget],
      colorResolveTo: [onscreenTexture],
      colorClearColor: [TransparentWhite],
    });

    renderPass.setPipeline(pipeline);
    renderPass.setVertexInput(
      inputLayout,
      [
        {
          buffer: vertexBuffer,
        },
      ],
      null,
    );
    renderPass.setViewport(0, 0, $canvas.width, $canvas.height);
    renderPass.draw(3);

    device.submitPass(renderPass);
    id = requestAnimationFrame(frame);
  };

  frame();

  return () => {
    if (id) {
      cancelAnimationFrame(id);
    }
    program.destroy();
    vertexBuffer.destroy();
    inputLayout.destroy();
    pipeline.destroy();
    renderTarget.destroy();
    device.destroy();

    // For debug.
    device.checkForLeaks();
  };
}

(async () => {
  let disposeCallback = await render(deviceContributionWebGL2);

  // GUI
  const gui = new lil.GUI({ autoPlace: false });
  $container.appendChild(gui.domElement);
  const rendererFolder = gui.addFolder('renderer');
  const rendererConfig = {
    renderer: 'webgl2',
  };
  rendererFolder
    .add(rendererConfig, 'renderer', ['webgl1', 'webgl2', 'webgpu'])
    .onChange(async (renderer) => {
      if (disposeCallback) {
        disposeCallback();
        // @ts-ignore
        disposeCallback = undefined;
      }

      if (renderer === 'webgl1') {
        disposeCallback = await render(deviceContributionWebGL1);
      } else if (renderer === 'webgl2') {
        disposeCallback = await render(deviceContributionWebGL2);
      } else if (renderer === 'webgpu') {
        disposeCallback = await render(deviceContributionWebGPU);
      }
    });
  rendererFolder.open();
})();

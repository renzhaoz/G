#pragma glslify: import('@antv/g-shader-components/scene.both.glsl')

#pragma glslify: import('@antv/g-shader-components/batch.declaration.vert')
#pragma glslify: project = require('@antv/g-shader-components/project.vert')

layout(location = POSITION) in vec2 a_Extrude;
layout(location = PACKED_STYLE3) in vec4 a_StylePacked3;
layout(location = SIZE) in vec2 a_Size;
#ifdef USE_UV
  layout(location = UV) in vec2 a_Uv;
  out vec2 v_Uv;
#endif

out vec4 v_Data;
out vec2 v_Radius;
out vec4 v_StylePacked3;

void main() {
  #pragma glslify: import('@antv/g-shader-components/batch.vert')
  #pragma glslify: import('@antv/g-shader-components/uv.vert')

  float strokeWidth;
  if (u_IsPicking > 0.5) {
    strokeWidth = u_IncreasedLineWidthForHitTesting + u_StrokeWidth;
  } else {
    strokeWidth = u_StrokeWidth;
  }

  float antialiasblur = 1.0 / (a_Size.x + strokeWidth);

  bool omitStroke = a_StylePacked3.z == 1.0;
  vec2 radius = a_Size + vec2(omitStroke ? 0.0 : strokeWidth / 2.0);
  vec2 offset = (a_Extrude + vec2(1.0) - 2.0 * u_Anchor.xy) * radius;

  bool isBillboard = a_StylePacked3.w > 0.5;
  if (isBillboard) {
    #pragma glslify: import('@antv/g-shader-components/billboard.vert')
  } else {
    gl_Position = project(vec4(offset, u_ZIndex, 1.0), u_ProjectionMatrix, u_ViewMatrix, u_ModelMatrix);
  }
  
  v_Radius = radius;
  v_Data = vec4(a_Extrude, antialiasblur, a_StylePacked3.x);
  v_StylePacked3 = a_StylePacked3;
}
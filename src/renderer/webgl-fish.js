import { getFishAtlas } from './atlas.js'
import { fishPose } from './fish-pose.js'
import { bodyEnvelope, advanceVisualYaw } from './fish-volume.js'

// One isolated renderer owns its WebGL resources. When WebGL is absent or the
// context is lost, the caller uses the Canvas fallback with the same pose.
const vertexShader = `
attribute vec2 aUv;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform vec4 uFrame;
uniform vec2 uAtlas;
uniform float uPhase;
uniform float uTail;
uniform float uFin;
uniform float uYaw;
uniform float uPitch;
uniform float uSide;
uniform vec4 uBody;
uniform float uVolume;
varying vec2 vTex;
varying vec2 vUv;
varying float vBody;
void main() {
  float u = aUv.x;
  float v = aUv.y;
  float tail = pow(1.0-u, 2.0);
  // Fins occupy the outer bands of the sprite, not the very edge rows: a
  // smoothstep keeps the body steady and lets the membranes travel.
  float fins = smoothstep(0.2, 0.5, abs(v-0.5))*(1.0-u*.4);
  float beat = sin(uPhase-(1.0-u)*4.2);
  float flutter = sin(uPhase*1.6+u*5.0+v*2.4);
  // The flare opens and closes the fin pair around the body midline.
  float flare = sin(uPhase*1.05+v*4.0);
  float lift = sign(v-0.5)*fins*uFin*.8*flare;
  float x = (u-.52)*uSize.x + beat*tail*uSize.x*.05 + flutter*fins*uSize.x*uFin*.45;
  float y = (v-.5 + beat*tail*uTail + flutter*fins*uFin + lift)*uSize.y;
  vec2 p = (aUv-uBody.xy)/uBody.zw;
  float body = max(0.0, 1.0-dot(p,p));
  float z = uSide * sqrt(body) * uVolume * uSize.x + beat*tail*uSize.x*.13;
  float screenX = x*cos(uYaw) + z*sin(uYaw);
  vec2 pixel = uCenter + vec2(screenX*cos(uPitch)-y*sin(uPitch),screenX*sin(uPitch)+y*cos(uPitch));
  gl_Position = vec4(pixel.x/uViewport.x*2.0-1.0,1.0-pixel.y/uViewport.y*2.0,0.0,1.0);
  vTex = (uFrame.xy + aUv*uFrame.zw)/uAtlas;
  vUv = aUv;
  vBody = body;
}`
const fragmentShader = `
precision mediump float;
uniform sampler2D uTexture;
uniform float uHunger;
uniform float uDepth;
uniform float uLight;
varying vec2 vTex;
varying vec2 vUv;
varying float vBody;
void main() {
  vec4 texel = texture2D(uTexture, vTex);
  if (texel.a < .004) discard;
  float luminance = dot(texel.rgb, vec3(.2126,.7152,.0722));
  vec3 color = mix(texel.rgb, vec3(luminance), clamp(uHunger*.55,0.0,.55));
  float rim = pow(max(0.0,1.0-abs(vUv.y-.42)*2.0), 3.0);
  color *= (1.0-uHunger*.10) * (.93 + uDepth*.07);
  color += vec3(.035,.055,.035)*rim*uLight;
  color += vec3(.025,.038,.029)*vBody*uLight;
  gl_FragColor = vec4(color, texel.a);
}`

function compile(gl, kind, source) {
  const shader = gl.createShader(kind)
  if (!shader) throw new Error('No shader available')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failed')
  return shader
}

function makeRenderer() {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true })
  if (!gl) return null
  const program = gl.createProgram()
  if (!program) return null
  const vert = compile(gl, gl.VERTEX_SHADER, vertexShader)
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragmentShader)
  gl.attachShader(program, vert); gl.attachShader(program, frag); gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed')
  gl.deleteShader(vert); gl.deleteShader(frag)
  function makeGrid(columns, rows) {
    const geometry = []
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const x0 = x / columns, x1 = (x + 1) / columns
        const y0 = y / rows, y1 = (y + 1) / rows
        geometry.push(x0,y0, x1,y0, x0,y1, x1,y0, x1,y1, x0,y1)
      }
    }
    return new Float32Array(geometry)
  }
  const grids = [makeGrid(40, 20), makeGrid(14, 8)]
  let gridIndex = 0
  const buffer = gl.createBuffer(), textures = [gl.createTexture(), gl.createTexture(), gl.createTexture()]
  if (!buffer || textures.some(texture => !texture)) return null
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, grids[gridIndex], gl.STATIC_DRAW)
  for (const texture of textures) {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }
  const names = ['uViewport','uCenter','uSize','uFrame','uAtlas','uPhase','uTail','uFin','uYaw','uPitch','uSide','uBody','uVolume','uHunger','uDepth','uLight','uTexture']
  const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]))
  const uploaded = [false, false, false]
  let lost = false
  const turns = new WeakMap()
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true })
  return {
    isLost() { return lost || gl.isContextLost() },
    dispose() { textures.forEach(texture => gl.deleteTexture(texture)); gl.deleteBuffer(buffer); gl.deleteProgram(program); canvas.width = 1; canvas.height = 1 },
    draw(context, view, fish, time, scale) {
      if (lost || gl.isContextLost()) return false
      const atlases = [getFishAtlas(0), getFishAtlas(6), getFishAtlas(12)]
      if (fish.some(f => !atlases[f.species >= 12 ? 2 : f.species >= 6 ? 1 : 0])) return false
      const dpr = Math.min(2, view.dpr || 1)
      const w = Math.max(1, Math.round(view.width * dpr)), h = Math.max(1, Math.round(view.height * dpr))
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      const nextGrid = fish.length > 32 ? 1 : 0
      if (nextGrid !== gridIndex) {
        gridIndex = nextGrid
        gl.bufferData(gl.ARRAY_BUFFER, grids[gridIndex], gl.STATIC_DRAW)
      }
      const location = gl.getAttribLocation(program, 'aUv')
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0)
      for (let i = 0; i < atlases.length; i += 1) {
        if (!atlases[i] || uploaded[i]) continue
        gl.bindTexture(gl.TEXTURE_2D, textures[i])
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlases[i])
        uploaded[i] = true
      }
      gl.enable(gl.BLEND)
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.uniform1i(uniforms.uTexture, 0)
      gl.uniform2f(uniforms.uViewport, view.width, view.height)
      const sorted = fish.slice().sort((a,b) => a.y - b.y)
      for (const f of sorted) {
        const atlasIndex = f.species >= 12 ? 2 : f.species >= 6 ? 1 : 0
        const atlas = atlases[atlasIndex]
        gl.bindTexture(gl.TEXTURE_2D, textures[atlasIndex])
        gl.uniform2f(uniforms.uAtlas, atlas.naturalWidth || atlas.width, atlas.naturalHeight || atlas.height)
        const pose = fishPose(f, scale, time, view.reducedMotion)
        const frame = pose.frame
        const previous = turns.get(f)
        const yaw = advanceVisualYaw(previous?.yaw, pose.angle, previous ? time - previous.time : 0, view.reducedMotion)
        turns.set(f, { yaw, time })
        const facing = Math.cos(pose.angle) < 0 ? -1 : 1
        const pitch = Math.atan2(Math.sin(pose.angle), Math.abs(Math.cos(pose.angle))) * facing * .24
        const body = bodyEnvelope(pose.species)
        gl.uniform2f(uniforms.uCenter, f.x * view.width, f.y * view.height)
        gl.uniform2f(uniforms.uSize, pose.length, pose.tall)
        gl.uniform4f(uniforms.uFrame, frame[0], frame[1], frame[2], frame[3])
        gl.uniform1f(uniforms.uPhase, pose.phase)
        gl.uniform1f(uniforms.uTail, view.reducedMotion ? 0 : pose.motion.tail)
        gl.uniform1f(uniforms.uFin, view.reducedMotion ? 0 : pose.motion.fin)
        gl.uniform1f(uniforms.uYaw, yaw)
        gl.uniform1f(uniforms.uPitch, pitch)
        gl.uniform4f(uniforms.uBody, body[0], body[1], body[2], body[3])
        gl.uniform1f(uniforms.uVolume, body[4])
        gl.uniform1f(uniforms.uHunger, Number.isFinite(f.hunger) ? f.hunger : 0)
        gl.uniform1f(uniforms.uDepth, pose.depth)
        gl.uniform1f(uniforms.uLight, view.reducedMotion ? .5 : .5 + .5 * Math.sin(time*.8 + f.x*6))
        // Draw the far surface before the near surface so the atlas alpha can
        // blend without one fish writing depth over its neighbours.
        const nearSide = Math.cos(yaw) < 0 ? -1 : 1
        gl.uniform1f(uniforms.uSide, -nearSide)
        gl.drawArrays(gl.TRIANGLES, 0, grids[gridIndex].length / 2)
        gl.uniform1f(uniforms.uSide, nearSide)
        gl.drawArrays(gl.TRIANGLES, 0, grids[gridIndex].length / 2)
      }
      context.drawImage(canvas, 0, 0, view.width, view.height)
      return true
    },
  }
}

let renderer
export function drawWebGLFish(context, view, fish, time, scale) {
  if (renderer === null) return false
  try {
    if (renderer && renderer.isLost()) { renderer.dispose(); renderer = undefined }
    if (!renderer) renderer = makeRenderer()
    return renderer ? renderer.draw(context, view, fish, time, scale) : false
  } catch (error) {
    console.warn('[fish-tank] WebGL 鱼群渲染不可用，使用 2D 回退', error)
    renderer = null
    return false
  }
}

export function disposeWebGLFish() {
  if (renderer) renderer.dispose()
  renderer = undefined
}

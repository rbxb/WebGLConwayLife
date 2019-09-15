const viewVertexShaderSource = `
	precision mediump float;
	uniform vec2 u_cam;
	uniform float u_scale;
	attribute vec2 a_pos;
	attribute vec2 a_uv;
	varying vec2 v_uv;
	void main() {
		gl_Position = vec4((a_pos + u_cam) * u_scale,0.0,1.0);
		v_uv = a_uv;
	}
`;

const viewFragmentShaderSource = `
	precision mediump float;
	uniform sampler2D u_map;
	uniform vec2 u_mapSize;
	varying vec2 v_uv;
	void main() {
		gl_FragColor = texture2D(u_map, v_uv);
	}
`;

const calcVertexShaderSource = `
	precision mediump float;
	attribute vec2 a_pos;
	attribute vec2 a_uv;
	varying vec2 v_uv;
	void main() {
		gl_Position = vec4(a_pos,0.0,1.0);
		v_uv = a_uv;
	}
`

const calcFragmentShaderSource = `
	precision mediump float;
	uniform sampler2D u_map;
	uniform vec2 u_mapSize;
	uniform bool u_calc;
	uniform vec2 u_flip;
	uniform vec2 u_neighbors[8];
	varying vec2 v_uv;
	void main() {
		vec4 color = texture2D(u_map,v_uv);
		bool alive = color.x > 0.0;
		vec2 px = 1.0 / u_mapSize;
		vec2 dif = abs(u_flip - v_uv);
		if (dif.x < px.x / 2.0 && dif.y < px.y / 2.0) {
			alive = !alive;
		}
		if (u_calc) {
			int count = 0;
			vec4 test;
			for (int i = 0; i < 8; i++) {
				vec2 n = u_neighbors[i];
				test = texture2D(u_map, v_uv + u_neighbors[i] * px);
				if (test.x > 0.0) count++;
			}
			if (alive) {
				if (count < 2 || count > 3) alive = false;
			} else {
				if (count == 3) alive = true;
			}
		}
		if (alive) {
			gl_FragColor = vec4(1.0,1.0,1.0,1.0);
		} else {
			gl_FragColor = vec4(0.0,0.0,0.0,1.0);
		}
	}
`

var glCameraPosition = {x:0.0,y:0.0};
var glScale = 1.0;
const canvas = document.querySelector("#gl-canvas");
var play = true;
const boardWidth = 64;
const boardHeight = 64;
var flip = null;
const neighborsArray = [
	-1, 1,
	 0, 1,
	 1, 1,
	 1, 0,
	 1,-1,
	 0,-1,
	-1,-1,
	-1, 0,
];

function setupWebGL() {
	const gl = canvas.getContext("webgl");
	if (gl == null) {
		alert("WebGL not supported.");
		return null;
	}

	const view = createViewProgram(gl);
	const calc = createCalcProgram(gl);

	var maps = [];
	var mapCount = 2;
	for (var i = 0; i < mapCount; i++) {
		const map = createMap(gl,boardWidth,boardHeight);
		const framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, map, 0);
		maps.push({map:map,framebuffer:framebuffer,width:boardWidth,height:boardWidth});
	}
	var currentMap = 0;

	var lastTimestamp = 0;
	var msMeter = document.querySelector("#ms-meter");
	var lastCalc = 0;

	function draw(t) {
		var dif = t - lastTimestamp;
		lastTimestamp = t;
		msMeter.innerHTML = Math.round(dif * 10) / 10 + " ms";
		doCalc = false;
		if (play && t - lastCalc > 64) {
			lastCalc = t;
			doCalc = true;
		}
		{
			gl.useProgram(calc.program);
			gl.bindTexture(gl.TEXTURE_2D, maps[currentMap].map);
			currentMap++
			if (currentMap >= mapCount) {
				currentMap = 0;
			}
			bindFramebuffer(gl, maps[currentMap].framebuffer, maps[currentMap].width, maps[currentMap].height);
			gl.clearColor(0.0, 0.4, 0.6, 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.uniform1i(calc.u_calc,doCalc);
			if (flip) {
				gl.uniform2f(calc.u_flip,flip.x,flip.y);
				flip = null;
			} else {
				gl.uniform2f(calc.u_flip,-1.0,-1.0);
			}
			gl.uniform2f(calc.u_mapSize,boardWidth,boardHeight);
			gl.uniform2fv(calc.u_neighbors, new Float32Array(neighborsArray));
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}
		{
			gl.useProgram(view.program);
			gl.bindTexture(gl.TEXTURE_2D, maps[currentMap].map);
			bindFramebuffer(gl, null, 0, 0);
			gl.clearColor(0.5, 0.5, 0.5, 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.uniform2f(view.u_cam,glCameraPosition.x,glCameraPosition.y);
			gl.uniform1f(view.u_scale,glScale);
			gl.uniform2f(view.u_mapSize,boardWidth,boardHeight);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}

		window.requestAnimationFrame(draw);
	}

	window.requestAnimationFrame(draw);
}

function bindFramebuffer(gl,framebuffer,width,height) {
	gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
	if (framebuffer) {
		gl.viewport(0, 0, width, height);
		gl.clearColor(1.0, 1.0, 1.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	} else {
		gl.viewport(0, 0, canvas.width, canvas.height);
	}
}

function createViewProgram(gl) {
	var programInfo = createShaderProgram(gl,viewVertexShaderSource,viewFragmentShaderSource);
	programAddTexturedPlane(gl, programInfo);
	{
		programInfo.u_cam = gl.getUniformLocation(programInfo.program, 'u_cam');
		programInfo.u_scale = gl.getUniformLocation(programInfo.program, 'u_scale');
		programInfo.u_mapSize = gl.getUniformLocation(programInfo.program, 'u_mapSize');
	}
	return programInfo;
}

function createCalcProgram(gl) {
	var programInfo = createShaderProgram(gl,calcVertexShaderSource,calcFragmentShaderSource);
	programAddTexturedPlane(gl, programInfo);
	{
		programInfo.u_mapSize = gl.getUniformLocation(programInfo.program, 'u_mapSize');
		programInfo.u_calc = gl.getUniformLocation(programInfo.program, 'u_calc');
		programInfo.u_flip = gl.getUniformLocation(programInfo.program, 'u_flip');
		programInfo.u_neighbors = gl.getUniformLocation(programInfo.program, 'u_neighbors');
	}
	return programInfo;
}

function createMap(gl,width,height) {
	const map = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, map);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	return map;
}

function programAddTexturedPlane(gl, programInfo) {
	gl.useProgram(programInfo.program);
	{
		programInfo.a_pos = gl.getAttribLocation(programInfo.program, 'a_pos');
		const positionBuffer = createPositionBuffer(gl);
		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.vertexAttribPointer(programInfo.a_pos,2,gl.FLOAT,false,0,0);
		gl.enableVertexAttribArray(programInfo.a_pos);
	}
	{
		programInfo.a_uv = gl.getAttribLocation(programInfo.program, 'a_uv');
		const uvBuffer = createUVBuffer(gl);
		gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
		gl.vertexAttribPointer(programInfo.a_uv,2,gl.FLOAT,false,0,0);
		gl.enableVertexAttribArray(programInfo.a_uv);
	}
}

function createShaderProgram(gl, vertexShaderSource, fragmentShaderSource) {
	const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
	const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
	const program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error(gl.getProgramInfoLog(program));
		return null;
	}
	return {program:program};
}

function compileShader(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error(gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}

function createPositionBuffer(gl) {
	const positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	const positions = [
		-1,-1,
		 1,-1,
		 1, 1,
		-1,-1,
		 1, 1,
		-1, 1,
	];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
	return positionBuffer;
}

function createUVBuffer(gl) {
	const uvBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
	const uvs = [
		0,0,
		1,0,
		1,1,
		0,0,
		1,1,
		0,1,
	];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
	return uvBuffer;
}

function setupMouseInput() {
	var down = false;
	canvas.addEventListener("mousedown", function(event){
		if (event.button != 0) {
			down = true;
		}
	});
	document.addEventListener("mouseup", function(event){
		down = false;
	});
	document.addEventListener("mousemove", function(event){
		if (down) {
			glCameraPosition.x += event.movementX / canvas.width / glScale;
			glCameraPosition.y -= event.movementY / canvas.height / glScale;
		}
	});
	canvas.addEventListener("wheel", function(event){
		const d = event.deltaY;
		if (d < 0) {
			glScale *= 1.04;
		} else {
			glScale *= 0.96;
		}
	});
	canvas.addEventListener("click", function(event){
		flip = {
			x: ((event.offsetX / canvas.width * 2 - 1) / glScale - glCameraPosition.x + 1) / 2,
			y: (((1-event.offsetY / canvas.height) * 2 - 1) / glScale - glCameraPosition.y + 1) / 2,
		}
	})
}

function setupPlayButton() {
	var playButton = document.querySelector("#play-button");
	playButton.addEventListener("click", function(){
		play = !play;
		playButton.setAttribute("state",play);
	});
}

function main() {
	setupMouseInput();
	setupPlayButton();
	setupWebGL();
}

main();
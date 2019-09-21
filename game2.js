const quadVertexShaderSource = `
	precision mediump float;
	attribute vec2 pos;

	void main() {
		gl_Position = vec4(pos, 0.0, 1.0);
	}
`

const viewFragmentShaderSource = `
	precision mediump float;
	uniform vec2 scale;
	uniform sampler2D tex;
	uniform vec2 cam;
	uniform float zoom;

	void main() {
		vec4 color = texture2D(tex, ((gl_FragCoord.xy / scale - 0.5) * zoom - cam) * (scale / scale.y));
		color.a = 1.0;
		gl_FragColor = color;
	}
`

const golFragmentShaderSource = `
	precision mediump float;
	uniform sampler2D tex;
	uniform float scale;
	uniform vec3 color;

	int get(vec2 xy) {
		return int(texture2D(tex, (gl_FragCoord.xy + xy) / scale).a);
	}

	void main() {
		vec4 cur = texture2D(tex, gl_FragCoord.xy / scale);
		bool alive = cur.a > 0.0;
		int count = 0;
		count += get(vec2(-1.0, 1.0));
		count += get(vec2( 0.0, 1.0));
		count += get(vec2( 1.0, 1.0));
		count += get(vec2( 1.0, 0.0));
		count += get(vec2( 1.0,-1.0));
		count += get(vec2( 0.0,-1.0));
		count += get(vec2(-1.0,-1.0));
		count += get(vec2(-1.0, 0.0));
		if (count == 3) alive = true;
		else if (count != 2) alive = false;
		if (alive) gl_FragColor = vec4(1.0,1.0,1.0,1.0);
		else gl_FragColor = cur * vec4(color,0.0);
	}
`

var canvas;
var msMeter;
var pausedIndicator;
var overlay;
var scaleInput;
var frequencyInput;
var colorInputs;
var showMsInput;
var showMsCheckboxCover;
var positionBuffer;

var golCameraPosition;
var golZoom;
var golScale;
var play;
var gl;

var pokes;
var randomMap;

var settings;

function main() {
	initConwayGame();
	initInput();
	frameloop();
}

function initConwayGame() {
	canvas = document.querySelector("#gl-canvas");
	msMeter = document.querySelector("#ms-meter");
	pausedIndicator = document.querySelector("#paused-indicator");
	overlay = document.querySelector("#option-overlay");
	scaleInput = overlay.querySelector("#scale-input");
	frequencyInput = overlay.querySelector("#frequency-input");
	colorInputs = overlay.querySelectorAll(".color-input");
	showMsInput = overlay.querySelector("#show-ms-input");
	exportLink = document.querySelector("#export-link");

	exportImage = false;

	golCameraPosition = {x:0.0,y:0.0};
	golZoom = 1.0;
	play = true;
	gl = null;
	pokes = [];
	randomMap = null;

	settings = {
		scale: 256,
		frequency: 0,
		colorScale: {r:0.2,g:0.88,b:0.94},
		showMs: false,
	};

	gl = canvas.getContext("webgl");
	if (gl == null) {
		alert("WebGL not supported.");
		return null;
	}
	
	positionBuffer = createPositionBuffer();

	viewProgramInfo = createViewProgram();
	golProgramInfo = createGolProgram();

	swapchain = null;
}

function frameloop() {
	var lastTimestamp = 0;
	var lastCalc = 0;
	function _frameloop(timestamp) {
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;
		if (golScale != settings.scale) {
			golScale = settings.scale;
			swapchain = new Swapchain(2,golScale);
		}
		var dif = timestamp - lastTimestamp;
		lastTimestamp = timestamp;
		msMeter.innerHTML = dif.toFixed(1) + "ms";
		if (play && timestamp - lastCalc > settings.frequency) {
			lastCalc = timestamp;
			gl.useProgram(golProgramInfo.program);
			gl.bindTexture(gl.TEXTURE_2D, swapchain.cur().tex);
			gl.bindFramebuffer(gl.FRAMEBUFFER, swapchain.next().framebuffer);
			gl.uniform3f(golProgramInfo.color,settings.colorScale.r,settings.colorScale.g,settings.colorScale.b);
			gl.uniform1f(golProgramInfo.scale,golScale);
			gl.viewport(0, 0, golScale, golScale);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}
		gl.useProgram(viewProgramInfo.program);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.bindTexture(gl.TEXTURE_2D, swapchain.cur().tex);
		for (var i = 0; i < pokes.length; i++) {
			p = pokes.pop();
			var color = [0,0,0,0];
			if (p.alive) {
				color = [255,255,255,255];
			}
			gl.texSubImage2D(gl.TEXTURE_2D, 0, p.x, p.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));
		}
		if (randomMap != null) {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, golScale, golScale, 0, gl.RGBA, gl.UNSIGNED_BYTE, randomMap);
			randomMap = null;
		}
		gl.clearColor(0.0,0.0,0.0,1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.uniform2f(viewProgramInfo.cam,golCameraPosition.x,golCameraPosition.y);
		gl.uniform1f(viewProgramInfo.zoom,golZoom);
		gl.uniform2f(viewProgramInfo.scale,canvas.width,canvas.height);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		window.requestAnimationFrame(_frameloop);
	}
	window.requestAnimationFrame(_frameloop);
}

function Swapchain(count,scale) {
	var a = [];
	var c = 0;
	for (var i = 0; i < count; i++) {
		const tex = createTexture(scale);
		const framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		gl.clearColor(0.0,0.0,0.0,1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		a.push({tex:tex,framebuffer:framebuffer,scale:scale});
	}
	this.cur = function() {
		return a[c];
	}
	this.next = function() {
		c++;
		if (c >= count) {
			c = 0;
		}
		return a[c];
	}
}

function createViewProgram() {
	var programInfo = createProgram(quadVertexShaderSource,viewFragmentShaderSource);
	bindPositionAttribute(programInfo,positionBuffer);
	programInfo.cam = gl.getUniformLocation(programInfo.program, 'cam');
	programInfo.zoom = gl.getUniformLocation(programInfo.program, 'zoom');
	programInfo.scale = gl.getUniformLocation(programInfo.program, 'scale');
	return programInfo;
}

function createGolProgram() {
	var programInfo = createProgram(quadVertexShaderSource,golFragmentShaderSource);
	bindPositionAttribute(programInfo,positionBuffer);
	programInfo.scale = gl.getUniformLocation(programInfo.program, 'scale');
	programInfo.color = gl.getUniformLocation(programInfo.program, 'color');
	return programInfo;
}

function createProgram(vertexShaderSource, fragmentShaderSource) {
	const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
	const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
	const program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error(gl.getProgramInfoLog(program));
		program = null;
	}
	return {program:program};
}

function compileShader(type, source) {
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

function bindPositionAttribute(programInfo, buffer) {
	gl.useProgram(programInfo.program);
	programInfo.pos = gl.getAttribLocation(programInfo.program, 'pos');
	const positionBuffer = createPositionBuffer(gl);
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.vertexAttribPointer(programInfo.pos,2,gl.FLOAT,false,0,0);
	gl.enableVertexAttribArray(programInfo.pos);
}

function createPositionBuffer() {
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

function createTexture(scale) {
	const tex = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, scale, scale, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	return tex;
}

function bindFramebuffer(surface) {
	if (surface) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
		gl.viewport(0, 0, surface.scale.x, surface.scale.y);
		gl.clearColor(1.0, 1.0, 1.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	} else {
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, canvas.width, canvas.height);
	}
}

function initInput() {
	var down = false;
	var draw = false;
	var alive = true;
	canvas.addEventListener("mousedown", function(event){
		event.preventDefault();
		switch (event.button) {
		case 0:
			draw = true;
			alive = true;
			break;
		case 2:
			draw = true;
			alive = false;
			break;
		default:
			down = true;
		}
	});
	canvas.addEventListener("mouseup", function(event){
		down = false;
		draw = false;
	});
	canvas.addEventListener("mousemove", function(event){
		if (down) {
			golCameraPosition.x += event.movementX / canvas.width * 0.6 * golZoom;
			golCameraPosition.y -= event.movementY / canvas.height * 0.6 * golZoom;
		}
		if (draw) {
			poke(event.offsetX,event.offsetY,alive);
		}
	});
	canvas.addEventListener("click", function(event){
		event.preventDefault();
		switch (event.button) {
		case 0:
			poke(event.offsetX,event.offsetY,true);
		case 2:
			poke(event.offsetX,event.offsetY,false);
		}
	});
	canvas.addEventListener("wheel", function(event){
		const d = event.deltaY;
		if (d > 0) {
			golZoom *= 1.08;
		} else {
			golZoom *= 0.92;
		}
		if (golZoom > 2) golZoom = 2;
		if (golZoom < 0.08) golZoom = 0.08;
	});
	canvas.oncontextmenu = function(event) {
		return false;
	};
	document.addEventListener("keydown", function(event) {
		switch (event.keyCode) {
		case 32:
			event.preventDefault();
			play = !play;
			pausedIndicator.classList.toggle('info-hidden');
			break;
		case 82:
			randomMap = new Uint8Array(golScale * golScale * 4);
			for (var i = 0; i < golScale * golScale; i++) {
				var pos = i * 4;
				var color;
				if (Math.random() > 0.5) color = [255,255,255,255];
				else color = [0,0,0,0];
				for (var k = 0; k < color.length; k++) randomMap[pos+k] = color[k];
			}
			break;
		case 67:
			randomMap = new Uint8Array(golScale * golScale * 4);
			break;
		case 79:
		case 27:
			if (overlay.style.visibility == 'visible') {
				overlay.style.visibility = 'hidden';
				saveSettings();
			} else {
				loadSettings();
				overlay.style.visibility = 'visible';
			}
			break;
		case 13:
			event.preventDefault();
			if (overlay.style.visibility == 'visible') {
				saveSettings();
				loadSettings();
			}
			break;
		}			
	});
}

function loadSettings() {
	scaleInput.value = settings.scale;
	frequencyInput.value = settings.frequency;
	colorInputs[0].value = settings.colorScale.r.toFixed(2);
	colorInputs[1].value = settings.colorScale.g.toFixed(2);
	colorInputs[2].value = settings.colorScale.b.toFixed(2);
	if (showMsInput.checked) {
		event.target.style.backgroundColor = '#fff';
	} else {
		event.target.style.backgroundColor = '';
	}
}

function saveSettings() {
	var golScale = parseInt(scaleInput.value);
	golScale = Math.pow(2,Math.round(Math.log(golScale)/Math.log(2)));
	settings.scale = golScale;
	settings.frequency = parseFloat(frequencyInput.value);
	settings.colorScale = {
		r: parseFloat(colorInputs[0].value),
		g: parseFloat(colorInputs[1].value),
		b: parseFloat(colorInputs[2].value),
	};
	if (settings.colorScale.r > 1.0) settings.colorScale.r = 1.0;
	if (settings.colorScale.g > 1.0) settings.colorScale.g = 1.0;
	if (settings.colorScale.b > 1.0) settings.colorScale.b = 1.0;
}

function poke(x,y,alive) {
	var p = {
		x: Math.round(((x / canvas.width - 0.5) * golZoom - golCameraPosition.x) * golScale * (canvas.width/canvas.height) - 0.5) % golScale,
		y: Math.round(((1 - y / canvas.height - 0.5) * golZoom - golCameraPosition.y) * golScale - 0.5) % golScale,
		alive: alive,
	};
	if (p.x < 0) p.x = golScale + p.x;
	if (p.y < 0) p.y = golScale + p.y;
	pokes.push(p);
}

function filterInput(event) {
	event.target.value = event.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
}

function showMsInputClick(event) {
	showMsInput.checked = !showMsInput.checked;
	msMeter.classList.toggle('info-hidden');
	if (showMsInput.checked) {
		event.target.style.backgroundColor = '#fff';
	} else {
		event.target.style.backgroundColor = '';
	}
}

function importMapClick() {
	/*var tempInput = document.createElement('input');
	tempInput.type = 'file';
	tempInput.click();
	input.onchange = function(event) {
		var file = event.target.files[0];
		event.target.remove();
	}*/
}

function exportMapClick() {
	gl.bindFramebuffer(gl.FRAMEBUFFER, swapchain.cur().framebuffer);
	var data = new Uint8ClampedArray(golScale * golScale * 4);
	gl.readPixels(0, 0, golScale, golScale, gl.RGBA, gl.UNSIGNED_BYTE, data);
	var imagedata = new ImageData(data,golScale,golScale);
	var tempCanvas = document.createElement('canvas');
	var ctx = tempCanvas.getContext('2d');
	tempCanvas.width = imagedata.width;
	tempCanvas.height = imagedata.height;
	ctx.putImageData(imagedata, 0, 0);
	var dataurl = tempCanvas.toDataURL("image/png",1.0);
	tempCanvas.remove();
	exportLink.href = dataurl;
	exportLink.download = "map.png";
}
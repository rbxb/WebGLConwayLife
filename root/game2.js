function gol() {
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
			gl_FragColor = texture2D(tex, (gl_FragCoord.xy / scale - 0.5) * zoom - cam);
		}
	`
	
	const golFragmentShaderSource = `
		precision mediump float;
		uniform sampler2D tex;
		uniform vec2 scale;
	
		int get(vec2 xy) {
			return int(texture2D(tex, (gl_FragCoord.xy + xy) / scale).r);
		}
	
		void main() {
			vec4 cur = texture2D(tex, gl_FragCoord.xy / scale);
			bool alive = cur.r > 0.0;
			int count = 0;
			count += get(vec2(-1.0, 1.0));
			count += get(vec2( 0.0, 1.0));
			count += get(vec2( 1.0, 1.0));
			count += get(vec2( 1.0, 0.0));
			count += get(vec2( 1.0,-1.0));
			count += get(vec2( 0.0,-1.0));
			count += get(vec2(-1.0,-1.0));
			count += get(vec2(-1.0, 0.0));
			if (alive) {
				if (count < 2 || count > 3) alive = false;
			} else {
				if (count == 3) alive = true;
			}
			if (alive) gl_FragColor = vec4(1.0,1.0,1.0,1.0);
			else gl_FragColor = cur * vec4(0.0,0.6,0.6,1.0);
		}
	`

	const canvas = document.querySelector("#gl-canvas");
	const msMeter = document.querySelector("#ms-meter");
	const golScale = {x:512,y:512};
	var positionBuffer;

	var golCameraPosition = {x:0.0,y:0.0};
	var golZoom = 1.0;
	var play = true;
	var gl = null;

	var pokes = [];

	function main() {
		gl = canvas.getContext("webgl");
		if (gl == null) {
			alert("WebGL not supported.");
			return null;
		}
		
		positionBuffer = createPositionBuffer();

		var viewProgramInfo = createViewProgram();
		var golProgramInfo = createGolProgram();

		var surfaces = [];
		var surfaceCount = 2;
		for (var i = 0; i < surfaceCount; i++) {
			const tex = createTexture(golScale);
			const framebuffer = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
			gl.clearColor(0.0,0.0,0.0,1.0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			surfaces.push({tex:tex,framebuffer:framebuffer,scale:golScale});
		}
		var currentSurface = 0;

		var lastTimestamp = 0;
		var lastCalc = 0;
		function draw(timestamp) {
			var dif = timestamp - lastTimestamp;
			lastTimestamp = timestamp;
			msMeter.innerHTML = Math.round(dif * 10) / 10 + " ms";
			if (play && timestamp - lastCalc > 32) {
				lastCalc = timestamp;
				gl.useProgram(golProgramInfo.program);
				gl.bindTexture(gl.TEXTURE_2D, surfaces[currentSurface].tex);
				currentSurface++;
				if (currentSurface >= surfaceCount) {
					currentSurface = 0;
				}
				gl.bindFramebuffer(gl.FRAMEBUFFER, surfaces[currentSurface].framebuffer);
				gl.viewport(0, 0, golScale.x, golScale.y);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
			}
			gl.useProgram(viewProgramInfo.program);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.bindTexture(gl.TEXTURE_2D, surfaces[currentSurface].tex);
			for (var i = 0; i < pokes.length; i++) {
				p = pokes.pop();
				var color = [0,0,0,255];
				if (p.alive) {
					color = [255,255,255,255];
				}
				gl.texSubImage2D(gl.TEXTURE_2D, 0, p.x, p.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(color));
			}
			gl.clearColor(0.0,0.0,0.0,1.0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.uniform2f(viewProgramInfo.cam,golCameraPosition.x,golCameraPosition.y);
			gl.uniform1f(viewProgramInfo.zoom,golZoom);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
			window.requestAnimationFrame(draw);
		}
		window.requestAnimationFrame(draw);
	}

	function createViewProgram() {
		var programInfo = createProgram(quadVertexShaderSource,viewFragmentShaderSource);
		bindPositionAttribute(programInfo,positionBuffer);
		programInfo.cam = gl.getUniformLocation(programInfo.program, 'cam');
		programInfo.zoom = gl.getUniformLocation(programInfo.program, 'zoom');
		programInfo.scale = gl.getUniformLocation(programInfo.program, 'scale');
		gl.uniform2f(programInfo.scale,canvas.width,canvas.height);
		return programInfo;
	}

	function createGolProgram() {
		var programInfo = createProgram(quadVertexShaderSource,golFragmentShaderSource);
		bindPositionAttribute(programInfo,positionBuffer);
		programInfo.scale = gl.getUniformLocation(programInfo.program, 'scale');
		gl.uniform2f(programInfo.scale,golScale.x,golScale.y);
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
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, scale.x, scale.y, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
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

	function setupMouseInput() {
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
		document.addEventListener("mouseup", function(event){
			down = false;
			draw = false;
		});
		document.addEventListener("mousemove", function(event){
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
	}
	
	function setupPlayButton() {
		var playButton = document.querySelector("#play-button");
		playButton.addEventListener("click", function(){
			play = !play;
			playButton.setAttribute("state",play);
		});
	}

	function poke(x,y,alive) {
		var p = {
			//(gl_FragCoord.xy / scale - 0.5) * zoom + cam
			x: Math.round(((x / canvas.width - 0.5) * golZoom - golCameraPosition.x) * golScale.x - 0.5) % golScale.x,
			y: Math.round(((1 - y / canvas.height - 0.5) * golZoom - golCameraPosition.y) * golScale.y - 0.5) % golScale.y,
			alive: alive,
		};
		if (p.x < 0) p.x = golScale.x + p.x;
		if (p.y < 0) p.y = golScale.y + p.y;
		pokes.push(p);
	}

	setupMouseInput();
	setupPlayButton();
	main();
}

gol();
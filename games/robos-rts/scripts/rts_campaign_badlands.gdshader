shader_type spatial;
render_mode cull_disabled;

uniform sampler2D sandstone : source_color, repeat_enable, filter_linear_mipmap_anisotropic;
uniform float shade = 0.9;
varying vec2 ground_position;

void vertex() {
	ground_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

float noise_at_corner(vec2 point) {
	return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float ground_noise(vec2 point) {
	vec2 cell = floor(point);
	vec2 weight = smoothstep(vec2(0.0), vec2(1.0), fract(point));
	return mix(
		mix(noise_at_corner(cell), noise_at_corner(cell + vec2(1.0, 0.0)), weight.x),
		mix(noise_at_corner(cell + vec2(0.0, 1.0)), noise_at_corner(cell + vec2(1.0, 1.0)), weight.x),
		weight.y);
}

void fragment() {
	mat2 rotation = mat2(vec2(0.8, -0.6), vec2(0.6, 0.8));
	vec3 grit = mix(texture(sandstone, ground_position / 24.0).rgb,
		texture(sandstone, rotation * ground_position / 35.0).rgb, 0.38);
	float macro = 0.68 * ground_noise(ground_position / 18.0)
		+ 0.32 * ground_noise(ground_position / 6.0);
	float gray = dot(grit, vec3(0.2126, 0.7152, 0.0722));
	vec3 rust = mix(grit, vec3(gray), 0.28) * vec3(0.88, 0.78, 0.64);
	vec3 shale = mix(grit, vec3(gray), 0.56) * vec3(0.62, 0.54, 0.49);
	ALBEDO = mix(shale, rust, smoothstep(0.2, 0.8, macro)) * shade;
	ROUGHNESS = 0.98;
}

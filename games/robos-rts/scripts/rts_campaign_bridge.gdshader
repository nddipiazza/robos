shader_type spatial;
render_mode cull_disabled;

uniform sampler2D paving : source_color, repeat_enable, filter_linear_mipmap_anisotropic;

void fragment() {
	vec3 surface = texture(paving, vec2(UV.x * 0.58, UV.y / 16.0)).rgb;
	float edge = abs(UV.x - 0.5);
	float shoulder = smoothstep(0.415, 0.46, edge);
	float panel_edge = abs(fract(UV.y / 4.3 + 0.5) - 0.5) * 4.3;
	float seam = 1.0 - smoothstep(0.045, 0.14, panel_edge);
	float rib = 1.0 - smoothstep(0.004, 0.014, abs(edge - 0.418));
	float marking = (1.0 - smoothstep(0.006, 0.012, edge)) * step(0.63, fract(UV.y / 3.8));
	float gray = dot(surface, vec3(0.2126, 0.7152, 0.0722));
	ALBEDO = mix(surface, vec3(gray), 0.78) * (0.61 - shoulder * 0.23 - seam * 0.20 + rib * 0.19);
	ALBEDO = mix(ALBEDO, vec3(0.31, 0.27, 0.18), marking * 0.36);
	ROUGHNESS = 0.88;
}

shader_type spatial;
render_mode unshaded, cull_disabled;

void fragment() {
	vec2 p = UV * 115.0;
	float flow = sin(p.x * 0.72 + cos(p.y * 0.45 - TIME) * 2.5 + TIME * 0.6);
	float ridges = sin(p.y * 0.85 + flow * 2.8 + TIME * 0.3);
	float heat = smoothstep(-0.4, 0.9, ridges * flow);
	ALBEDO = mix(vec3(0.20, 0.025, 0.012), vec3(1.0, 0.33, 0.035), heat);
	EMISSION = vec3(1.0, 0.18, 0.012) * heat * 0.7;
}

shader_type spatial;
render_mode cull_disabled, shadows_disabled, specular_disabled;

uniform sampler2D ground_mask : filter_linear, repeat_disable;
uniform sampler2D ground_pattern : source_color, filter_linear_mipmap, repeat_enable;
uniform vec2 grid_extent;
varying vec2 world_xz;

void vertex() {
	world_xz = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

void fragment() {
	float coverage = texture(ground_mask, world_xz / grid_extent).a;
	vec3 pattern = texture(ground_pattern, world_xz / 15.0).rgb;
	ALBEDO = pattern;
	ALPHA = 0.91 * smoothstep(0.47, 0.92, coverage + 0.35 * pattern.r);
	ROUGHNESS = 0.96;
}

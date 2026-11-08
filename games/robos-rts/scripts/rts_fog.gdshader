shader_type spatial;
render_mode unshaded, depth_draw_never, depth_test_disabled, cull_disabled;

uniform sampler2D scene_depth : hint_depth_texture, repeat_disable, filter_nearest;
uniform sampler2D sight_mask : repeat_disable, filter_linear;
uniform vec2 grid_extent;

void vertex() {
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

void fragment() {
	float depth = texture(scene_depth, SCREEN_UV).r;
	// Compatibility uses OpenGL's [-1, 1] clip-space depth.
	vec3 ndc = vec3(SCREEN_UV, depth) * 2.0 - 1.0;
	vec4 view = INV_PROJECTION_MATRIX * vec4(ndc, 1.0);
	vec3 world = (INV_VIEW_MATRIX * vec4(view.xyz / view.w, 1.0)).xyz;
	ALBEDO = vec3(0.016, 0.031, 0.051);
	ALPHA = depth > 0.0 ? texture(sight_mask, world.xz / grid_extent).a : 0.0;
}

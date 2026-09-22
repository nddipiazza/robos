shader_type canvas_item;
render_mode blend_mix;

uniform vec4 shroud_color : source_color = vec4(0.02, 0.02, 0.04, 1.0);
uniform float memory_darkness : hint_range(0.0, 1.0) = 0.65;
uniform bool enabled = true;

void fragment() {
	if (!enabled) {
		COLOR = vec4(0.0, 0.0, 0.0, 0.0);
	} else {
		vec4 fog_sample = texture(TEXTURE, UV);
		float explored = fog_sample.r;
		float in_vision = fog_sample.g;
		
		// Unexplored (explored = 0.0): alpha = 1.0 (pitch black)
		// Explored in memory (explored = 1.0, in_vision = 0.0): alpha = memory_darkness (0.65)
		// In active vision (in_vision = 1.0): alpha = 0.0 (transparent clear sight)
		float alpha = (1.0 - explored) + (explored * (1.0 - in_vision) * memory_darkness);
		COLOR = vec4(shroud_color.rgb, clamp(alpha, 0.0, 1.0));
	}
}

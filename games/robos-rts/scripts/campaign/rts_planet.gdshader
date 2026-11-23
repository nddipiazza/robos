shader_type canvas_item;

uniform vec4 primary_color : source_color = vec4(0.64, 0.35, 0.22, 1.0);
uniform vec4 secondary_color : source_color = vec4(0.33, 0.17, 0.11, 1.0);
uniform vec4 accent_color : source_color = vec4(0.85, 0.58, 0.42, 1.0);
uniform vec4 atmo_color : source_color = vec4(0.85, 0.55, 0.37, 1.0);
uniform vec4 glow_color : source_color = vec4(1.0, 0.46, 0.25, 1.0);
uniform float cloud_density : hint_range(0.0, 1.0) = 0.26;
uniform float glow_strength : hint_range(0.0, 1.5) = 0.25;
uniform float planet_seed = 3.7;
uniform vec2 viewport_aspect = vec2(1.93, 1.0);

float hash31(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.yzx + 33.33);
	return fract((p.x + p.y) * p.z);
}

float noise3(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
			mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
		mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
			mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
		f.z
	);
}

float fbm(vec3 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 5; i++) {
		v += a * noise3(p);
		p = p * 2.07 + vec3(13.1, 7.7, 5.3);
		a *= 0.5;
	}
	return v;
}

float ridged(vec3 p) {
	float v = 0.0;
	float a = 0.52;
	for (int i = 0; i < 4; i++) {
		float n = 1.0 - abs(noise3(p) * 2.0 - 1.0);
		v += a * n * n;
		p = p * 2.15 + vec3(4.2, 9.1, 2.8);
		a *= 0.5;
	}
	return v;
}

mat3 rot_y(float a) {
	float c = cos(a);
	float s = sin(a);
	return mat3(vec3(c, 0.0, -s), vec3(0.0, 1.0, 0.0), vec3(s, 0.0, c));
}

void fragment() {
	vec2 uv = UV;
	vec2 p = (uv - vec2(0.5)) * 2.0;
	p.x *= viewport_aspect.x / viewport_aspect.y;

	// Deep cosmic backdrop with warm stellar dust near the planet's sunlit side
	vec3 bg = vec3(0.022, 0.026, 0.032);
	float dust = exp(-length(p - vec2(0.18, -0.08)) * 1.15);
	bg += atmo_color.rgb * dust * 0.16;
	bg += vec3(0.09, 0.055, 0.035) * exp(-length(p - vec2(-0.35, -0.15)) * 1.35);

	// Crisp procedural starfield
	vec2 star_cell = floor(uv * vec2(340.0, 190.0));
	vec2 star_f = fract(uv * vec2(340.0, 190.0)) - 0.5;
	float sh = fract(sin(dot(star_cell, vec2(127.1, 311.7))) * 43758.5453);
	if (sh > 0.985) {
		float d = length(star_f);
		float twinkle = 0.75 + 0.25 * sin(TIME * 2.2 + sh * 80.0);
		float bright = smoothstep(0.32, 0.02, d) * twinkle * (sh - 0.985) * 55.0;
		bg += vec3(0.82, 0.88, 1.0) * bright;
	}

	// Planet sphere positioned on the right half just like reference Image 5
	vec2 center = vec2(0.62, 0.04);
	float radius = 0.80;
	vec2 dvec = p - center;
	float dist = length(dvec);

	vec3 col = bg;

	// Outer atmospheric halo outside sphere edge
	if (dist >= radius) {
		float halo = exp(-(dist - radius) * 9.5);
		vec2 dir2 = normalize(dvec + vec2(0.0001));
		float sun_side = clamp(dot(dir2, normalize(vec2(-0.78, -0.46))) * 0.65 + 0.45, 0.05, 1.0);
		col += atmo_color.rgb * halo * 0.48 * sun_side;
	} else {
		vec2 sp = dvec / radius;
		float z = sqrt(max(0.0, 1.0 - dot(sp, sp)));
		vec3 normal = normalize(vec3(sp.x, -sp.y, z));

		// Axial tilt + slow orbital spin
		vec3 tilted = normalize(vec3(normal.x, normal.y * 0.94 - normal.z * 0.34, normal.y * 0.34 + normal.z * 0.94));
		vec3 world_pos = rot_y(TIME * 0.048 + planet_seed * 1.7) * tilted;
		vec3 seed_off = vec3(planet_seed * 11.3, planet_seed * 5.7, planet_seed * 8.9);

		float continent = fbm(world_pos * 2.65 + seed_off);
		float detail = fbm(world_pos * 8.4 + seed_off * 1.7);
		float mountain = ridged(world_pos * 5.2 + seed_off * 0.9);
		float craters = smoothstep(0.62, 0.78, ridged(world_pos * 11.5 - seed_off));

		// Surface albedo blend
		vec3 albedo = mix(secondary_color.rgb, primary_color.rgb, smoothstep(0.36, 0.64, continent));
		albedo = mix(albedo, accent_color.rgb, smoothstep(0.55, 0.86, continent * 0.65 + mountain * 0.45));
		albedo *= 0.78 + 0.42 * detail;
		albedo = mix(albedo, secondary_color.rgb * 0.65, craters * 0.35);

		// Bump-perturbed normal for crisp crater/ridge relief along the terminator
		float eps = 0.015;
		float h0 = continent * 0.6 + mountain * 0.4;
		float hx = fbm((world_pos + vec3(eps, 0.0, 0.0)) * 2.65 + seed_off) * 0.6 + ridged((world_pos + vec3(eps, 0.0, 0.0)) * 5.2 + seed_off * 0.9) * 0.4;
		float hy = fbm((world_pos + vec3(0.0, eps, 0.0)) * 2.65 + seed_off) * 0.6 + ridged((world_pos + vec3(0.0, eps, 0.0)) * 5.2 + seed_off * 0.9) * 0.4;
		vec3 bumped = normalize(normal + vec3(h0 - hx, h0 - hy, 0.0) * 3.4);

		vec3 light_dir = normalize(vec3(-0.74, 0.44, 0.50));
		float ndotl = dot(bumped, light_dir);
		float smooth_l = smoothstep(-0.16, 0.88, ndotl);
		float terminator_warmth = exp(-pow((ndotl - 0.04) * 5.0, 2.0));

		// Cloud layer rotating slightly faster
		vec3 cloud_pos = rot_y(TIME * 0.072 + planet_seed * 3.1) * tilted;
		float c_noise = fbm(cloud_pos * 3.8 + vec3(2.0, 6.0, 9.0));
		float clouds = smoothstep(1.0 - cloud_density * 1.15, 1.02, c_noise) * cloud_density * 1.45;
		float cloud_shadow = smoothstep(1.0 - cloud_density * 1.15, 1.02, fbm((cloud_pos - light_dir * 0.025) * 3.8 + vec3(2.0, 6.0, 9.0)));
		albedo *= 1.0 - cloud_shadow * cloud_density * 0.42;

		vec3 lit = albedo * (0.035 + 1.18 * smooth_l);
		lit += atmo_color.rgb * terminator_warmth * 0.14;

		// Clouds catch sunlight
		float cloud_lit = smoothstep(-0.10, 0.82, dot(normal, light_dir));
		lit = mix(lit, mix(vec3(0.10, 0.12, 0.15), vec3(0.96, 0.93, 0.90), cloud_lit), clamp(clouds, 0.0, 0.82));

		// Tectonic fissures / colony night lights on the shadowed hemisphere
		float fissure = pow(clamp(ridged(world_pos * 7.8 + seed_off * 2.3), 0.0, 1.0), 5.5);
		float night_mask = smoothstep(0.28, -0.22, ndotl);
		lit += glow_color.rgb * fissure * glow_strength * (0.35 + 0.95 * night_mask);

		// Fresnel atmospheric rim scatter
		float ndotv = clamp(normal.z, 0.0, 1.0);
		float fresnel = pow(1.0 - ndotv, 3.1);
		float rim_sun = smoothstep(-0.35, 0.75, dot(normal, light_dir));
		lit += atmo_color.rgb * fresnel * (0.18 + 0.78 * rim_sun);

		// Anti-aliased limb blend
		float edge_aa = smoothstep(radius, radius - 0.009, dist);
		col = mix(col, lit, edge_aa);
	}

	// Subtle CRT scanline & vignette inside the space monitor
	float scan = 0.97 + 0.03 * sin(FRAGCOORD.y * 2.1);
	col *= scan;
	COLOR = vec4(col, 1.0);
}

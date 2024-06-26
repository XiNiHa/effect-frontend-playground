import {
	defineConfig,
	presetAttributify,
	presetIcons,
	presetUno,
	transformerDirectives,
	transformerVariantGroup,
} from "unocss";

export default defineConfig({
	content: {
		pipeline: {
			include: ["src/**/*.ts"],
		},
	},
	presets: [presetUno(), presetAttributify(), presetIcons()],
	transformers: [transformerVariantGroup(), transformerDirectives()],
});

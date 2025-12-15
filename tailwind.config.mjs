/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				// Rational Elegance Palette
				primary: '#D00000', // New Yorker Red

				// Light Mode (Warm/Creamy)
				'bg-light': '#FDFBF9',
				'text-light': '#1A1A1A',
				'text-muted-light': '#555555',

				// Dark Mode (OpenAI/Modern Dark)
				'bg-dark': '#131316',
				'text-dark': '#EDEDED',
				'text-muted-dark': '#A1A1AA',
			},
			fontFamily: {
				serif: ['"Playfair Display"', '"Noto Serif SC"', 'serif'],
				sans: ['"Inter"', 'system-ui', 'sans-serif'],
			},
		},
	},
	plugins: [
		require('@tailwindcss/typography'),
	],
}

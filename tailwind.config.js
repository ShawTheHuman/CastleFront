/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./game/**/*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            fontFamily: {
                serif: ['Crimson Pro', 'serif'],
                display: ['Cinzel', 'serif'],
            },
        },
    },
    plugins: [],
}

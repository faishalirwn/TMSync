const path = require('path');

module.exports = {
    mode: 'development',
    entry: {
        background: './src/background.js',
        content: './src/content.js',
        iframe: './src/iframe.js',
        popup: './src/popup.js',
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
    },
    devtool: 'cheap-module-source-map'
}
const path = require('path');
const Dotenv = require('dotenv-webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development',
    entry: {
        background: './src/background.js',
        content: './src/content.js',
        iframe: './src/iframe.js',
        popup: './src/popup.js'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist')
    },
    devtool: 'cheap-module-source-map',
    plugins: [
        new Dotenv(),
        new CopyPlugin({
            patterns: [
                { from: './src/manifest.json', to: './manifest.json' }
            ]
        })
    ]
};

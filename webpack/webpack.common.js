const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const srcDir = path.join(__dirname, '..', 'src');

module.exports = {
    entry: {
        popup: path.join(srcDir, 'popup/index.tsx'),
        options: path.join(srcDir, 'options/index.tsx'),
        background: path.join(srcDir, 'background/index.ts'),
        contentScript: path.join(srcDir, 'content-scripts/main/index.tsx'),
        traktContentScript: path.join(srcDir, 'content-scripts/trakt/index.tsx')
    },
    output: {
        path: path.join(__dirname, '../dist/js'),
        filename: '[name].js'
    },
    optimization: {
        splitChunks: {
            name: 'vendor',
            chunks(chunk) {
                return chunk.name !== 'background';
            }
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: [/node_modules/, /\.test\.ts$/, /\.test\.tsx$/, /__tests__/]
            },
            {
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    'postcss-loader'
                ]
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js']
    },
    plugins: [
        new Dotenv(),
        new CopyPlugin({
            patterns: [{ from: '.', to: '../', context: 'public' }]
        }),
        new MiniCssExtractPlugin({
            filename: '../css/styles.css'
        })
    ]
};

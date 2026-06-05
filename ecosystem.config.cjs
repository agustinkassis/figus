module.exports = {
  apps: [
    {
      name: "issuer",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "issuer/index.ts",
      interpreter: "node",
      watch: false,
      env_file: ".env.local",
    },
  ],
};

module.exports = {
  apps: [
    {
      name: "issuer",
      script: "./node_modules/.bin/tsx",
      args: "issuer/index.ts",
      interpreter: "node",
      watch: false,
      env_file: ".env.local",
    },
  ],
};

module.exports = {
  apps: [
    {
      name: "issuer",
      script: "./node_modules/.bin/tsx.cmd",
      args: "issuer/index.ts",
      watch: false,
      env_file: ".env.local",
    },
  ],
};

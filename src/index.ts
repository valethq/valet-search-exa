import { definePlugin } from "@valethq/sdk";
import { type ExaConfig, RANK, settings } from "./config";
import { exaClient } from "./exa";
import { fetchTool, searchTool } from "./tools";

export default definePlugin<ExaConfig>({
  async activate(ctx) {
    let current = settings(ctx.config);
    const exa = exaClient({
      get baseUrl() {
        return current.baseUrl;
      },
      key: () => ctx.secrets.get(current.secret),
    });
    if (!(await ctx.secrets.get(current.secret))) {
      ctx.log.warn("no Exa API key yet; tools will report it until one is added", { secret: current.secret });
    }
    ctx.onConfigChange((next) => {
      current = settings(next);
    });
    const deps = { exa, settings: () => current };
    const tools = [searchTool(deps), fetchTool(deps)];
    ctx.scopes.provide("tools", {
      list: ({ role }) => (RANK[role] >= RANK[current.minRole] ? tools : []),
    });
    ctx.log.info("exa search ready", { minRole: current.minRole });
  },
});

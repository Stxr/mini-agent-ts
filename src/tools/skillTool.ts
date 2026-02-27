import { BaseTool, type Tool, type ToolResult } from "./base.js";
import { SkillLoader } from "./skillLoader.js";

export class GetSkillTool extends BaseTool {
  readonly name = "get_skill";
  readonly description =
    "Get complete content and guidance for a specified skill, used for executing specific types of tasks";
  readonly parameters = {
    type: "object",
    properties: {
      skill_name: {
        type: "string",
        description: "Name of the skill to retrieve"
      }
    },
    required: ["skill_name"]
  };

  constructor(private readonly skillLoader: SkillLoader) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const skillName = typeof args.skill_name === "string" ? args.skill_name : "";
    if (!skillName) {
      return { success: false, content: "", error: "Missing required argument: skill_name" };
    }

    const skill = this.skillLoader.getSkill(skillName);
    if (!skill) {
      const available = this.skillLoader.listSkills().join(", ");
      return {
        success: false,
        content: "",
        error: `Skill '${skillName}' does not exist. Available skills: ${available}`
      };
    }

    return { success: true, content: skill.toPrompt() };
  }
}

export async function createSkillTools(skillsDir = "./skills"): Promise<{ tools: Tool[]; loader: SkillLoader | null }> {
  const loader = new SkillLoader(skillsDir);
  const skills = await loader.discoverSkills();
  console.log(`✅ Discovered ${skills.length} Claude Skills`);
  return {
    tools: [new GetSkillTool(loader)],
    loader
  };
}

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SkillLoader } from "../src/tools/skillLoader.js";
import { GetSkillTool, createSkillTools } from "../src/tools/skillTool.js";

async function createSkill(dir: string, name: string, description: string, content: string): Promise<void> {
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}\n`,
    "utf-8"
  );
}

describe("skill tool", () => {
  it("returns full skill content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-ts-skilltool-"));
    await createSkill(dir, "test-skill-0", "Test skill 0 description", "Test skill 0 content and instructions.");

    const loader = new SkillLoader(dir);
    await loader.discoverSkills();

    const tool = new GetSkillTool(loader);
    const result = await tool.execute({ skill_name: "test-skill-0" });

    expect(result.success).toBe(true);
    expect(result.content).toContain("test-skill-0");
    expect(result.content).toContain("Test skill 0 description");

    await rm(dir, { recursive: true, force: true });
  });

  it("returns error for non-existent skill", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-ts-skilltool-"));
    await createSkill(dir, "test-skill-0", "d", "c");

    const loader = new SkillLoader(dir);
    await loader.discoverSkills();

    const tool = new GetSkillTool(loader);
    const result = await tool.execute({ skill_name: "nonexistent-skill" });

    expect(result.success).toBe(false);
    expect((result.error ?? "").toLowerCase()).toContain("does not exist");

    await rm(dir, { recursive: true, force: true });
  });

  it("createSkillTools returns a single get_skill tool", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-ts-skilltool-"));
    await createSkill(dir, "simple-skill", "Simple test", "Content");

    const { tools, loader } = await createSkillTools(dir);
    expect(tools.length).toBe(1);
    expect(tools[0]?.name).toBe("get_skill");
    expect(loader).not.toBeNull();

    await rm(dir, { recursive: true, force: true });
  });
});

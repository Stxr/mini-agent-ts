import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SkillLoader } from "../src/tools/skillLoader.js";

async function createSkill(dir: string, name: string, description: string, content: string): Promise<void> {
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}\n`,
    "utf-8"
  );
}

describe("skill loader", () => {
  it("loads valid skill", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-ts-skill-"));
    await createSkill(dir, "test-skill", "A test skill", "This is a test skill content.");

    const loader = new SkillLoader(dir);
    const skill = await loader.loadSkill(join(dir, "test-skill", "SKILL.md"));

    expect(skill).not.toBeNull();
    expect(skill?.name).toBe("test-skill");
    expect(skill?.description).toBe("A test skill");
    expect(skill?.content).toContain("test skill content");

    await rm(dir, { recursive: true, force: true });
  });

  it("discovers multiple skills", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-ts-skill-"));
    await createSkill(dir, "skill-0", "d0", "c0");
    await createSkill(dir, "skill-1", "d1", "c1");
    await createSkill(dir, "skill-2", "d2", "c2");

    const loader = new SkillLoader(dir);
    const skills = await loader.discoverSkills();

    expect(skills.length).toBe(3);
    expect(loader.listSkills().length).toBe(3);

    await rm(dir, { recursive: true, force: true });
  });

  it("generates metadata-only prompt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-ts-skill-"));
    await createSkill(dir, "pdf", "PDF manipulation toolkit", "Detailed Skill Content\nSection 1");
    await createSkill(dir, "docx", "Document creation tool", "Detailed Skill Content\nSection 2");

    const loader = new SkillLoader(dir);
    await loader.discoverSkills();

    const prompt = loader.getSkillsMetadataPrompt();
    expect(prompt).toContain("Available Skills");
    expect(prompt).toContain("pdf");
    expect(prompt).toContain("docx");
    expect(prompt).not.toContain("Detailed Skill Content");

    await rm(dir, { recursive: true, force: true });
  });

  it("includes root directory in toPrompt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-ts-skill-"));
    await createSkill(dir, "root-test", "Root test", "Skill content here.");

    const loader = new SkillLoader(dir);
    const skill = await loader.loadSkill(join(dir, "root-test", "SKILL.md"));
    const prompt = skill?.toPrompt() ?? "";

    expect(prompt).toContain("Skill Root Directory");
    expect(prompt).toContain(join(dir, "root-test"));

    await rm(dir, { recursive: true, force: true });
  });
});

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { PathLike } from "node:fs";
import { resolve, dirname } from "node:path";
import { glob } from "node:fs/promises";
import yaml from "js-yaml";

export interface Skill {
  name: string;
  description: string;
  content: string;
  license?: string;
  allowedTools?: string[];
  metadata?: Record<string, string>;
  skillPath?: string;
  toPrompt(): string;
}

class SkillImpl implements Skill {
  name: string;
  description: string;
  content: string;
  license?: string;
  allowedTools?: string[];
  metadata?: Record<string, string>;
  skillPath?: string;

  constructor(input: Omit<Skill, "toPrompt">) {
    this.name = input.name;
    this.description = input.description;
    this.content = input.content;
    this.license = input.license;
    this.allowedTools = input.allowedTools;
    this.metadata = input.metadata;
    this.skillPath = input.skillPath;
  }

  toPrompt(): string {
    const skillRoot = this.skillPath ? dirname(this.skillPath) : "unknown";
    return `\n# Skill: ${this.name}\n\n${this.description}\n\n**Skill Root Directory:** \`${skillRoot}\`\n\nAll files and references in this skill are relative to this directory.\n\n---\n\n${this.content}\n`;
  }
}

interface SkillFrontMatter {
  name?: string;
  description?: string;
  license?: string;
  [key: string]: unknown;
}

export class SkillLoader {
  private readonly skillsDir: string;
  private readonly loadedSkills = new Map<string, Skill>();

  constructor(skillsDir = "./skills") {
    this.skillsDir = resolve(skillsDir);
  }

  async loadSkill(skillPath: string): Promise<Skill | null> {
    try {
      const content = await readFile(skillPath, "utf-8");
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

      if (!frontmatterMatch) {
        console.log(`⚠️  ${skillPath} missing YAML frontmatter`);
        return null;
      }

      const frontmatterText = frontmatterMatch[1];
      const skillContent = frontmatterMatch[2].trim();

      let frontmatter: SkillFrontMatter;
      try {
        frontmatter = (yaml.load(frontmatterText) as SkillFrontMatter) ?? {};
      } catch (error) {
        console.log(`❌ Failed to parse YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }

      if (!frontmatter.name || !frontmatter.description) {
        console.log(`⚠️  ${skillPath} missing required fields (name or description)`);
        return null;
      }

      const skillDir = dirname(skillPath);
      const processedContent = await this.processSkillPaths(skillContent, skillDir);

      return new SkillImpl({
        name: frontmatter.name,
        description: frontmatter.description,
        content: processedContent,
        license: frontmatter.license,
        allowedTools: Array.isArray(frontmatter["allowed-tools"])
          ? (frontmatter["allowed-tools"] as string[])
          : undefined,
        metadata:
          typeof frontmatter.metadata === "object" && frontmatter.metadata !== null
            ? (frontmatter.metadata as Record<string, string>)
            : undefined,
        skillPath
      });
    } catch (error) {
      console.log(`❌ Failed to load skill (${skillPath}): ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async discoverSkills(): Promise<Skill[]> {
    const skills: Skill[] = [];

    if (!existsSync(this.skillsDir)) {
      console.log(`⚠️  Skills directory does not exist: ${this.skillsDir}`);
      return skills;
    }

    for await (const entry of glob("**/SKILL.md", { cwd: this.skillsDir })) {
      const fullPath = resolve(this.skillsDir, entry as PathLike as string);
      const skill = await this.loadSkill(fullPath);
      if (skill) {
        skills.push(skill);
        this.loadedSkills.set(skill.name, skill);
      }
    }

    return skills;
  }

  getSkill(name: string): Skill | null {
    return this.loadedSkills.get(name) ?? null;
  }

  listSkills(): string[] {
    return Array.from(this.loadedSkills.keys());
  }

  getSkillsMetadataPrompt(): string {
    if (this.loadedSkills.size === 0) {
      return "";
    }

    const lines: string[] = [];
    lines.push("## Available Skills\n");
    lines.push("You have access to specialized skills. Each skill provides expert guidance for specific tasks.\n");
    lines.push("Load a skill's full content using get_skill(skill_name) when needed.\n");

    for (const skill of this.loadedSkills.values()) {
      lines.push(`- \`${skill.name}\`: ${skill.description}`);
    }

    return lines.join("\n");
  }

  private async processSkillPaths(content: string, skillDir: string): Promise<string> {
    let processed = content;

    const replaceIfExists = async (relativePath: string): Promise<string | null> => {
      const full = resolve(skillDir, relativePath.replace(/^\.\//, ""));
      return existsSync(full) ? full : null;
    };

    const scriptRegex = /(python\s+|`)((?:scripts|references|assets)\/[^\s`\)]+)/g;
    const scriptMatches = Array.from(processed.matchAll(scriptRegex));
    for (const match of scriptMatches) {
      const full = await replaceIfExists(match[2]);
      if (full) {
        processed = processed.replace(match[0], `${match[1]}${full}`);
      }
    }

    const docRegex = /(see|read|refer to|check)\s+([a-zA-Z0-9_-]+\.(?:md|txt|json|yaml))([.,;\s])/gi;
    const docMatches = Array.from(processed.matchAll(docRegex));
    for (const match of docMatches) {
      const full = await replaceIfExists(match[2]);
      if (full) {
        processed = processed.replace(match[0], `${match[1]} \`${full}\` (use read_file to access)${match[3]}`);
      }
    }

    const markdownRegex = /(?:(Read|See|Check|Refer to|Load|View)\s+)?\[(`?[^`\]]+`?)\]\(((?:\.\/)?[^)]+\.(?:md|txt|json|yaml|js|py|html))\)/gi;
    const markdownMatches = Array.from(processed.matchAll(markdownRegex));
    for (const match of markdownMatches) {
      const full = await replaceIfExists(match[3]);
      if (full) {
        const prefix = match[1] ? `${match[1]} ` : "";
        processed = processed.replace(match[0], `${prefix}[${match[2]}](\`${full}\`) (use read_file to access)`);
      }
    }

    return processed;
  }
}

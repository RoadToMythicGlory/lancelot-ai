/**
 * Seed script that loads the Hebrew user manual from docs/user-manual/*.md
 * into the HelpArticle MongoDB collection.
 *
 * Run with: npm run seed:help
 *
 * Behaviour:
 *  - Reads every .md file in docs/user-manual/ except _TEMPLATE.md and 00-index.md.
 *  - Maps the file number (01..20) to a HelpArticle category.
 *  - Uses the first level-1 heading (`# title`) as titleHe.
 *  - Uses the first blockquote ("> ...") as excerptHe.
 *  - Stores the full raw markdown as contentHe + content.
 *  - UPSERTS by slug (filename without extension), so re-running the script
 *    updates existing articles in place without creating duplicates.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectMongoose } from '../config/mongodb';
import { HelpArticle } from '../models/help.models';

type Category =
  | 'getting_started' | 'broadcast' | 'mcr' | 'shifts' | 'warehouse'
  | 'chat' | 'ai' | 'admin' | 'billing' | 'api' | 'troubleshooting';

// Map the order-prefix of each manual file to one of the limited HelpArticle categories.
// (The HelpArticle schema's category enum is intentionally narrow — modules without a
//  perfect bucket go to `admin` or `getting_started` as catch-alls.)
const PREFIX_TO_CATEGORY: Record<string, Category> = {
  '01': 'getting_started',
  '02': 'getting_started',
  '03': 'admin',
  '04': 'shifts',
  '05': 'broadcast',
  '06': 'broadcast',
  '07': 'mcr',
  '08': 'warehouse',
  '09': 'admin',
  '10': 'admin',
  '11': 'admin',
  '12': 'chat',
  '13': 'admin',
  '14': 'billing',
  '15': 'admin',
  '16': 'api',
  '17': 'admin',
  '18': 'getting_started',
  '19': 'troubleshooting',
  '20': 'admin',
};

const SKIP_FILES = new Set(['_TEMPLATE.md', '00-index.md']);

interface ParsedArticle {
  slug: string;
  order: number;
  category: Category;
  titleHe: string;
  excerptHe: string;
  contentHe: string;
}

function parseMarkdown(filename: string, raw: string): ParsedArticle | null {
  const match = filename.match(/^(\d{2})-(.+)\.md$/);
  if (!match) return null;

  const [, prefix, slugStem] = match;
  const slug = `${prefix}-${slugStem}`;
  const order = parseInt(prefix, 10);
  const category = PREFIX_TO_CATEGORY[prefix] ?? 'getting_started';

  const lines = raw.split(/\r?\n/);

  // First H1 -> titleHe
  let titleHe = slugStem;
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)$/);
    if (m) {
      titleHe = m[1].trim();
      break;
    }
  }

  // First blockquote block (consecutive lines starting with `> `) -> excerptHe
  const excerptParts: string[] = [];
  let inQuote = false;
  for (const line of lines) {
    if (line.startsWith('>')) {
      inQuote = true;
      excerptParts.push(line.replace(/^>\s?/, '').replace(/\*\*/g, '').trim());
    } else if (inQuote) {
      break;
    }
  }
  const excerptHe = excerptParts.filter(Boolean).join(' ').slice(0, 500);

  return {
    slug,
    order,
    category,
    titleHe,
    excerptHe,
    contentHe: raw,
  };
}

async function seedHelpArticles() {
  // Find the workspace root by walking up from this file. The script lives at
  // services/api-gateway/src/scripts/seed-help-articles.ts, so docs/ is four
  // directories above.
  const here = __dirname;
  const workspaceRoot = path.resolve(here, '..', '..', '..', '..');
  const manualDir = path.join(workspaceRoot, 'docs', 'user-manual');

  console.log(`📖 Reading user manual from: ${manualDir}`);

  if (!fs.existsSync(manualDir)) {
    console.error(`❌ Directory not found: ${manualDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(manualDir)
    .filter((f) => f.endsWith('.md') && !SKIP_FILES.has(f))
    .sort();

  console.log(`📚 Found ${files.length} markdown files`);

  const articles: ParsedArticle[] = [];
  for (const file of files) {
    const full = path.join(manualDir, file);
    const raw = fs.readFileSync(full, 'utf8');
    const parsed = parseMarkdown(file, raw);
    if (parsed) articles.push(parsed);
    else console.warn(`⚠️  Skipped (could not parse filename): ${file}`);
  }

  try {
    await connectMongoose();
    console.log('🔗 Connected to MongoDB');

    let inserted = 0;
    let updated = 0;
    for (const article of articles) {
      const existing = await HelpArticle.findOne({ slug: article.slug });

      if (existing) {
        existing.title = article.titleHe;
        existing.titleHe = article.titleHe;
        existing.content = article.contentHe;
        existing.contentHe = article.contentHe;
        existing.excerpt = article.excerptHe;
        existing.excerptHe = article.excerptHe;
        existing.category = article.category;
        existing.order = article.order;
        existing.isPublished = true;
        existing.tags = Array.from(
          new Set([...(existing.tags || []), 'user-manual', 'he'])
        );
        if (!existing.authorId) existing.authorId = 'system';
        if (!existing.authorName) existing.authorName = 'Lancelot Docs';
        await existing.save();
        updated++;
        console.log(`🔄 Updated: ${article.slug} (${article.category})`);
      } else {
        await HelpArticle.create({
          title: article.titleHe,
          titleHe: article.titleHe,
          slug: article.slug,
          content: article.contentHe,
          contentHe: article.contentHe,
          excerpt: article.excerptHe,
          excerptHe: article.excerptHe,
          category: article.category,
          tags: ['user-manual', 'he'],
          order: article.order,
          isPublished: true,
          viewCount: 0,
          helpfulCount: 0,
          notHelpfulCount: 0,
          authorId: 'system',
          authorName: 'Lancelot Docs',
        });
        inserted++;
        console.log(`✅ Inserted: ${article.slug} (${article.category})`);
      }
    }

    console.log('');
    console.log(`🎉 Help seeding complete: ${inserted} inserted, ${updated} updated, ${articles.length} total.`);
  } catch (err) {
    console.error('❌ Error seeding help articles:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

seedHelpArticles();

# Date Extraction System - Quick Reference

## What Changed

✅ Upgraded from legacy OpenAI API to GPT-4.1 with strict JSON mode
✅ Switched model to `gpt-4-turbo-preview` with temperature 0
✅ Implemented strict JSON schema with YYYYMMDD date format
✅ Added intelligent document chunking for long syllabi
✅ Built deduplication using exact and fuzzy matching
✅ Created comprehensive test suite with realistic syllabus samples

## New Function Signature

```typescript
import { extractDatesFromDocument } from '@/lib/syllabus-date-extractor'

const dates = await extractDatesFromDocument(
  syllabusText: string,
  openaiApiKey: string,
  config?: {
    chunkSize?: number      // default: 3000
    chunkOverlap?: number   // default: 200
    maxRetries?: number     // default: 3
    retryDelay?: number     // default: 1000ms
  }
)
```

## Response Format

```typescript
interface ExtractedDate {
  text_span: string           // "Midterm Exam: March 15, 2025"
  normalized_date: string     // "20250315" (YYYYMMDD)
  category: 'exam' | 'quiz' | 'assignment_due' | 'class_session' | 'holiday' | 'other'
  description: string         // "Midterm Exam"
}
```

## Categories

- `exam` - Midterms, finals, major tests
- `quiz` - Quizzes and short assessments
- `assignment_due` - Homework, projects, deliverables
- `class_session` - Regular class meetings
- `holiday` - Breaks, holidays, no-class days
- `other` - Miscellaneous events

## Example Usage

```typescript
const syllabusText = `
CS 101 - Spring 2025
Midterm Exam: March 15, 2025
Final Exam: May 10, 2025
`

const dates = await extractDatesFromDocument(syllabusText, apiKey)

console.log(dates)
// [
//   {
//     text_span: 'Midterm Exam: March 15, 2025',
//     normalized_date: '20250315',
//     category: 'exam',
//     description: 'Midterm Exam'
//   },
//   {
//     text_span: 'Final Exam: May 10, 2025',
//     normalized_date: '20250510',
//     category: 'exam',
//     description: 'Final Exam'
//   }
// ]
```

## Testing

```bash
# Run all tests
npm test

# Watch mode (run tests on file changes)
npm run test:watch

# Visual UI for tests
npm run test:ui
```

## Key Features

🎯 **Strict JSON Output** - No more parsing errors or markdown code blocks
📏 **YYYYMMDD Format** - Consistent, sortable, validatable date format
📚 **Smart Chunking** - Handles syllabi of any length automatically
🔄 **Deduplication** - Removes exact and near-duplicate dates
🔁 **Retry Logic** - Automatic retries with exponential backoff
✅ **Comprehensive Tests** - 15+ test cases with realistic syllabus samples

## Files Created/Modified

**New Files:**
- `lib/syllabus-date-extractor.ts` - Main extraction module
- `__tests__/syllabus-date-extractor.test.ts` - Test suite
- `vitest.config.ts` - Test configuration
- `lib/DATE_EXTRACTION_GUIDE.md` - Full documentation
- `UPGRADE_SUMMARY.md` - Detailed upgrade notes
- `QUICK_REFERENCE.md` - This file

**Modified Files:**
- `supabase/functions/process-document/index.ts` - Uses new extraction system
- `package.json` - Added test scripts and vitest dependencies

## Build Status

✅ Build successful - all changes compile correctly

```bash
npm run build
# ✓ Compiled successfully
```

## Need Help?

- **API Reference**: See `lib/DATE_EXTRACTION_GUIDE.md`
- **Detailed Changes**: See `UPGRADE_SUMMARY.md`
- **Tests**: See `__tests__/syllabus-date-extractor.test.ts`
- **Troubleshooting**: Check DATE_EXTRACTION_GUIDE.md troubleshooting section

## Priority Dashboard Rollout

- Run `supabase db push` (or apply the SQL manually) so tasks gain the new `priority`, `goal`, `estimated_hours`, `progress`, `location`, `due_time`, and `metadata` columns (migration `20251127104500_extend_tasks_with_priority_and_metadata.sql`).
- Apply the new Google integrations schema with `supabase db push` to create `google_integrations` (migration `20251127120000_create_google_integrations_table.sql`). Set `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in your `.env.local` to enable OAuth + syncing.
- Rebuild the client so `lib/tasks.ts` picks up the new fields; existing CRUD helpers now accept priority/effort options.
- Visit the “Priorities” view in the app; the dashboard now loads live Supabase task data, respects existing list assignments for the “Goal” label, and lets you complete items directly.
- Execute `npm test -- lib/__tests__/priorities.test.ts` to validate the priority stats/sorting helpers that power the dashboard cards and filters.

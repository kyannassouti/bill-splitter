# Bill Splitter

## Tech Stack
- **Framework:** Next.js 16 (App Router) with TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** Supabase (PostgreSQL)
- **Package manager:** npm

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — run ESLint

## Project Structure
```
src/
├── app/                  # Next.js App Router pages
│   ├── layout.tsx
│   ├── page.tsx          # Home / create session
│   └── session/[id]/     # Session flow
│       ├── items/        # Add/manage bill items
│       ├── tax-tip/      # Tax & tip settings
│       └── summary/      # Final split summary
├── components/ui/        # Reusable UI components (Button, Input, ItemCard)
├── contexts/             # React context providers
├── lib/supabase.ts       # Supabase client
└── types/types.ts        # Shared TypeScript types
```

## Database
Schema is defined in `supabase-schema.sql`. Four tables:
- `sessions` — bill splitting session
- `participants` — people in a session
- `items` — line items on the bill
- `item_shares` — how each item is split among participants

## Conventions
- Use functional React components with hooks
- Place reusable UI components in `src/components/ui/`
- Keep Supabase queries in `src/lib/`
- Use TypeScript types from `src/types/types.ts`

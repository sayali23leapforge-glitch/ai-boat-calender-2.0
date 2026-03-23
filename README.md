# Calendar App

A modern, feature-rich calendar and task management application with AI-powered intelligence.

## ✨ Features

- 📅 **Calendar Management** - Create and manage events with recurring support
- ✅ **Task Lists & Prioritization** - Organize tasks with priority levels and custom lists
- 🤖 **AI-Powered Creation** - Intelligent task and event parsing from natural language
- 📊 **Dashboard** - Priority and goal tracking with visual progress
- 👥 **User Profiles** - Personalized experience with user preferences
- 🔐 **Secure Authentication** - Email/password auth with Supabase
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile
- 💬 **Chat Integration** - Built-in messaging capabilities

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **UI Components**: Radix UI, Shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL via Supabase
- **AI**: OpenAI API Integration
- **Authentication**: Supabase Auth
- **Testing**: Vitest

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or pnpm
- Supabase account (free tier works)
- OpenAI API key (for AI features)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/calendar.git
cd calendar
```

2. **Install dependencies**
```bash
npm install
# or
pnpm install
```

3. **Set up environment variables**

Create `.env.local` in the project root:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Optional: Google Calendar Integration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm run start
```

### Testing

```bash
npm run test        # Run tests once
npm run test:watch  # Watch mode
npm run test:ui     # UI test runner
```

## 📦 Project Structure

```
.
├── app/                 # Next.js app directory
│   ├── api/            # API routes
│   ├── auth/           # Authentication pages
│   ├── layout.tsx      # Root layout
│   └── page.tsx        # Home page
├── components/         # React components
│   ├── ui/            # UI components
│   ├── auth/          # Auth components
│   └── ...            # Feature components
├── lib/               # Utilities and helpers
│   ├── supabase.ts   # Supabase client
│   ├── tasks.ts      # Task logic
│   ├── calendar.ts   # Calendar logic
│   └── ...
├── hooks/             # Custom React hooks
├── public/            # Static assets
├── styles/            # Global styles
└── supabase/          # Database migrations
```

## 🔗 Integrations

- **Supabase**: Database and authentication
- **OpenAI**: AI-powered task parsing
- **Google Calendar**: Calendar synchronization (optional)

## 📝 Database

This project uses Supabase with PostgreSQL. Key tables:

- `profiles` - User profiles and preferences
- `tasks` - Task management
- `task_lists` - Custom task lists
- `events` - Calendar events
- `goals` - Goal tracking

Migrations are in `supabase/migrations/`

## 🌐 Deployment

### Render

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. Create New → Web Service
4. Connect your GitHub repository
5. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - Add environment variables from `.env.local`
6. Deploy!

### Vercel (Alternative)

1. Push code to GitHub
2. Import project at [vercel.com](https://vercel.com)
3. Add environment variables
4. Deploy!

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please open a GitHub Issue.

---

Built with ❤️ for better productivity

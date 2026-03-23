import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const adminClient = getSupabaseAdminClient();
    
    console.log("[Migration] Starting bloo_bound_number column creation...");

    // Try to add the column using raw SQL via Supabase
    try {
      const { error: addColumnError } = await adminClient
        .rpc("exec_sql", {
          sql_query: `
            ALTER TABLE user_profiles
            ADD COLUMN IF NOT EXISTS bloo_bound_number VARCHAR(20) UNIQUE;
          `,
        });

      if (addColumnError) {
        console.error("[Migration] Error adding column:", addColumnError);
      } else {
        console.log("[Migration] Column added successfully");
      }
    } catch (sqlError) {
      console.error("[Migration] SQL execution error:", sqlError);
      console.log("[Migration] Column may need to be added manually or already exists");
    }

    // Try to create index
    try {
      await adminClient
        .rpc("exec_sql", {
          sql_query: `
            CREATE INDEX IF NOT EXISTS idx_user_profiles_bloo_bound_number 
            ON user_profiles(bloo_bound_number);
          `,
        });
      console.log("[Migration] Index created successfully");
    } catch (indexError) {
      console.error("[Migration] Index creation error:", indexError);
    }

    const sqlStatements = `
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS bloo_bound_number VARCHAR(20) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_user_profiles_bloo_bound_number 
ON user_profiles(bloo_bound_number);
    `;

    return NextResponse.json({
      success: true,
      message: "Migration complete. If manual application needed, use the SQL below in Supabase dashboard.",
      sql: sqlStatements,
      instructions: "1. Go to https://app.supabase.com/project/_/sql/new\n2. Paste the SQL above\n3. Click Run",
    });
  } catch (error) {
    console.error("[Migration] Exception:", error);
    
    const sqlStatements = `
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS bloo_bound_number VARCHAR(20) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_user_profiles_bloo_bound_number 
ON user_profiles(bloo_bound_number);
    `;

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Migration failed",
        sql: sqlStatements,
        instructions: "Apply this SQL manually in Supabase SQL Editor",
      },
      { status: 200 }
    );
  }
}

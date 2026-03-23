import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addBlooColumn() {
  try {
    console.log("Adding bloo_bound_number column to user_profiles...");

    const { data, error } = await supabase.rpc("execute_sql", {
      sql: `
        ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS bloo_bound_number VARCHAR(20) UNIQUE;

        CREATE INDEX IF NOT EXISTS idx_user_profiles_bloo_bound_number 
        ON user_profiles(bloo_bound_number);
      `,
    });

    if (error) {
      console.error("Error executing migration:", error);
      process.exit(1);
    }

    console.log("✅ Migration executed successfully!");
    console.log("Response:", data);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

addBlooColumn();

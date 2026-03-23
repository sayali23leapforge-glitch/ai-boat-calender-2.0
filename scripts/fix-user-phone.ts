import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixUserPhone(userId: string, incorrectPhone: string, correctPhone: string) {
  try {
    console.log(`Fixing phone for user ${userId}:`);
    console.log(`  Old: ${incorrectPhone}`);
    console.log(`  New: ${correctPhone}`);

    const { data, error } = await supabase
      .from("user_profiles")
      .update({ phone: correctPhone })
      .eq("user_id", userId)
      .select("user_id, phone");

    if (error) {
      console.error("Error updating phone:", error);
      process.exit(1);
    }

    console.log("✅ Phone updated successfully!");
    console.log("Updated record:", data);
  } catch (error) {
    console.error("Exception:", error);
    process.exit(1);
  }
}

// Fix the phone for user: ed37e413-8fee-499a-9d1b-c1d7e9f8d751
fixUserPhone(
  "ed37e413-8fee-499a-9d1b-c1d7e9f8d751",
  "+9920261793",  // Current (wrong)
  "+919920261793"  // Correct
);

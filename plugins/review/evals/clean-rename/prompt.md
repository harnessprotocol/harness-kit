---
max_turns: 8
runs: 1
timeout_seconds: 180
model: claude-haiku-5-5
allowed_tools: [Skill, Read, Glob, Grep]
tags: [review, rename]
---

Review my code changes.

There is no git checkout here. Review this diff as the current branch's changes:

```diff
diff --git a/config/settings.go b/config/settings.go
index abc1234..def5678 100644
--- a/config/settings.go
+++ b/config/settings.go
@@ -3,18 +3,18 @@ package config
 // Settings holds database connection parameters.
 type Settings struct {
-	DbHost string
-	DbPort int
-	DbName string
+	DatabaseHost string
+	DatabasePort int
+	DatabaseName string
 }

 func DefaultSettings() Settings {
 	return Settings{
-		DbHost: "localhost",
-		DbPort: 5432,
-		DbName: "app",
+		DatabaseHost: "localhost",
+		DatabasePort: 5432,
+		DatabaseName: "app",
 	}
 }
diff --git a/main.go b/main.go
index 111aaaa..222bbbb 100644
--- a/main.go
+++ b/main.go
@@ -9,5 +9,5 @@ func main() {
 	cfg := config.DefaultSettings()
-	dsn := fmt.Sprintf("host=%s port=%d dbname=%s", cfg.DbHost, cfg.DbPort, cfg.DbName)
+	dsn := fmt.Sprintf("host=%s port=%d dbname=%s", cfg.DatabaseHost, cfg.DatabasePort, cfg.DatabaseName)
 	// connect to database...
 }
```

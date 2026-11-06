---
max_turns: 8
runs: 1
timeout_seconds: 180
model: claude-haiku-5-5
allowed_tools: [Skill, Read, Glob, Grep]
tags: [review, go]
---

Review my code changes.

There is no git checkout here. Review this diff as the current branch's changes:

```diff
diff --git a/payment/processor.go b/payment/processor.go
new file mode 100644
index 0000000..a1b2c3d
--- /dev/null
+++ b/payment/processor.go
@@ -0,0 +1,48 @@
+package payment
+
+import (
+	"database/sql"
+	"fmt"
+)
+
+// Processor handles payment charging and transaction recording.
+type Processor struct {
+	db *sql.DB
+}
+
+func NewProcessor(db *sql.DB) *Processor {
+	return &Processor{db: db}
+}
+
+// Charge looks up the user's payment method and charges them.
+func (p *Processor) Charge(userID string, amount int) error {
+	// Look up payment method
+	row := p.db.QueryRow(
+		"SELECT card_token FROM payment_methods WHERE user_id = $1 AND active = true",
+		userID,
+	)
+	var token string
+	row.Scan(&token)  // error return ignored
+
+	if token == "" {
+		return fmt.Errorf("no payment method for user %s", userID)
+	}
+
+	// Call external payment provider
+	status := chargeCard(token, amount)
+	if status != "approved" {
+		return fmt.Errorf("charge declined: %s", status)
+	}
+
+	// Record the transaction
+	p.db.Exec(  // error return ignored
+		"INSERT INTO transactions (user_id, amount, status) VALUES ($1, $2, 'complete')",
+		userID, amount,
+	)
+	return nil
+}
+
+// chargeCard calls the external payment gateway. Stub implementation.
+func chargeCard(token string, amount int) string {
+	if token == "" || amount <= 0 {
+		return "declined"
+	}
+	return "approved"
+}
```

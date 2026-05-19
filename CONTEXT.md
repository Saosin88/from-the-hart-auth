# From The Hart Auth — Domain Glossary

> Canonical terms specific to the authentication & authorization service. Extends [master CONTEXT.md](../CONTEXT.md).
> Code conventions: [AGENTS.md](./AGENTS.md).

---

## Principals

### Registration

The process of creating a new **Principal**. Always triggers the **Email Verification Flow** as a side effect. Distinct from **Login**, which authenticates an already-registered **Principal**.

- _Avoid:_ "sign up", "create user", "create account"
- _Relationships:_ A **Registration** creates one **Principal**.
  Triggers one **Email Verification Flow**.

### Login

The process of authenticating an existing **Principal** via email and password. Does not create anything — only verifies credentials.

- _Avoid:_ "sign in", "authenticate" (too generic)
- _Relationships:_ A **Login** authenticates one **Principal**.
  Optionally produces one **Refresh Token**.

### Logout

The process of terminating a **Principal**'s session.

- _Avoid:_ "sign out", "end session"
- _Relationships:_ A **Logout** terminates one active session for one **Principal**.

### Token Refresh

The process of exchanging an existing **Refresh Token** for a new **ID Token** and a rotated **Refresh Token**. Does not involve credentials — the Refresh Token itself is the proof.

- _Avoid:_ "token renewal", "re-auth"
- _Relationships:_ A **Token Refresh** consumes one **Refresh Token** and produces one new **ID Token** and one new **Refresh Token**. Called by the [**Route Guard**](../from-the-hart-tech-website/CONTEXT.md#route-guard) in the **Website** before accessing protected pages.

### Principal

The authenticated cryptographic entity — *who you are* after a credential exchange. Defined in the master CONTEXT.md; repeated here because this service is where **Principal**s are created.

- _Avoid:_ "user", "user record"
- _Relationships:_ A **Principal** is created by **Registration**.
  Authenticated by **Login**.
  Its identifier becomes the identity anchor for **Token Store Documents**.

---

## Token Infrastructure

### Token Store

The data store for one-time-use credentials used in email verification and password reset flows.

**Documents are keyed by email** — the user knows their email when clicking a magic link, but not their uid. The document references the **Principal** internally for the actual identity operation.

- _Avoid:_ "Firestore", "the database" (ambiguous — specifically the auth token store)
- _Relationships:_ Each **Token Store Document** lives in the **Token Store**.
  Referenced by the **Auth Service** during email verification and password reset flows.

### Token Store Document

A record in the **Token Store** that holds a one-time-use signing key. A JWT is signed with the key and sent as an email link; when the link is clicked, the JWT is verified against the stored key, then the document is deleted.

The document key is the **Principal**'s email address — the JWT carries the email in its payload so the correct document can be looked up for verification.

- _Avoid:_ "key document", "verification record" (ambiguous — be specific about which flow)
- _Relationships:_ A **Token Store Document** belongs to one collection in the **Token Store**.
  One **Principal** may have zero or one active **Token Store Document** per flow (email verification or password reset).

### Refresh Token

A long-lived token issued alongside an **ID Token** during **Login** and rotated during **Token Refresh**. The persistent counterpart to the short-lived **ID Token**.

- _Avoid:_ "session token" (ambiguous)
- _Relationships:_ A **Refresh Token** is issued by the **Auth Service** to a **Principal**.
  Consumed during **Token Refresh** to issue a new **ID Token** and rotated **Refresh Token**.
  Consumed by the [**Route Guard**](../from-the-hart-tech-website/CONTEXT.md#route-guard) in the **Website** for silent renewal.

### Web API Key

A credential representing the *client-side* identity provider project, used for operations the server-side identity SDK does not support. Separate from service account credentials.

- _Avoid:_ "API key", "Firebase key" (ambiguous)
- _Relationships:_ Required by identity provider REST APIs for client-side flows.

---

## Flows

### Email Verification Flow

The process by which a newly registered **Principal** proves ownership of their email address via a one-time-use link delivered by email.

- **Document expiry:** 24 hours.
- _Avoid:_ "verification", "verify flow" (be exact)

### Password Reset Flow

The process by which an existing **Principal** resets a forgotten password via a one-time-use link delivered by email. Same mechanism as **Email Verification Flow** with a shorter expiry.

- **Document expiry:** 1 hour.
- _Avoid:_ "reset flow", "forgot password"

---

## Flagged Ambiguities

- **"user" in code vs. Principal in glossary:** The codebase uses "user" terminology but the canonical domain term is **Principal**. → See [TODO.md](../TODO.md#21-auth-service--rename-user-to-principal-throughout).
- **`accessToken` in `/auth/verify-access-token`:** The endpoint and field use `accessToken` but the actual entity is an **ID Token**. Already flagged in gateway and website glossaries; the auth service is the origin of the misnomer. → See [TODO.md](../TODO.md#22-auth-service--rename-accesstoken-to-idtoken).
- **`/auth/forgot-password` endpoint name:** The route matches the colloquial "forgot password" but the domain concept is **Password Reset Flow**. Low priority to rename since the URL is user-facing.

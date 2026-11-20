# Accounts

Who people are, what they may do, and who owns what.

## Language

**User**:
A person with a Perspectize account, linked to their sign-in identity.
_Avoid_: Account, member, author

**Identity provider**:
The outside service that signs people in and vouches for who they are. Perspectize stores only the link.

**Me**:
The signed-in user's own record. The id 0 in a create request means "derive me from my session".

**Role**:
What a user may do: admin, default, or sentinel.

**Admin**:
A user who may approve imports, close them and run larger batches.

**Sentinel user**:
A built-in non-person owner: "[deleted]" takes over a deleted user's content and perspectives; "[system]" owns content that predates ownership tracking.

**Owner**:
The user a row belongs to. Always the signed-in actor, never a client-supplied id.

**Active**:
Whether a user may use the app.

**Onboarding coach**:
The first-run checklist that introduces the app; it remembers its version, whether to show next session, and when it was completed.

**Intro version**:
The number that, when raised, makes everyone see the coach again.

**Demo mode**:
Running the app without sign-in, against its own sample data.

**Guest**:
A signed-out visitor; may read public rows only.

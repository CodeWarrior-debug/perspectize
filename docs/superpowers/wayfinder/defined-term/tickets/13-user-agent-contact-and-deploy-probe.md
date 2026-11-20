# Contact for the User-Agent and a deploy-host probe

Type: `wayfinder:task` (HITL) · Status: open · Blocked by: none · Claimed by: none

## Question

Nothing to decide here; two things must happen before the Wiktionary source can be locked. First, the owner chooses a real contact (an email address or a URL) for the User-Agent our backend sends to Wikimedia, as their API etiquette asks. Second, from the real deploy host (not a cloud session), send about five requests to `https://en.wiktionary.org/api/rest_v1/page/definition/worship` with that User-Agent and confirm they succeed, which settles whether the 429s seen from the cloud session were only the shared IP pool. Record the contact's location (not the address itself, if private) and the result here. Do not send the project's name or private details anywhere else.

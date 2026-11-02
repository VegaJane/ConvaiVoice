// Put this NEW script inside the Picture button prim only.
// Keep your existing Power/Dom script unchanged.
string PAGE = "https://convaivoice.onrender.com/snapshots";
// Paste the exact VALUE of SNAPSHOT_TOKEN from Render between the quotes.
string UPLOAD_CODE = "PASTE_YOUR_UPLOAD_CODE_HERE";

default
{
    touch_start(integer count)
    {
        key owner = llGetOwner();
        if (llDetectedKey(0) != owner) return;
        // Ignore touches passed from other HUD prims if this is the root.
        if (llDetectedLinkNumber(0) != llGetLinkNumber()) return;
        if (UPLOAD_CODE == "PASTE_YOUR_UPLOAD_CODE_HERE" || llStringLength(UPLOAD_CODE) < 16)
        {
            llOwnerSay("Set UPLOAD_CODE in the Picture button script to the exact snapshot upload code from Render.");
            return;
        }
        string name = llKey2Name(owner);
        if (name == "") name = llGetUsername(owner);
        string url = PAGE + "#name=" + llEscapeURL(name)
            + "&code=" + llEscapeURL(UPLOAD_CODE);
        llLoadURL(owner, "Show Riley a picture: open the page, paste your snip with Ctrl+V, then click Send to Riley.", url);
    }
    changed(integer changes)
    {
        if (changes & CHANGED_OWNER) llResetScript();
    }
}

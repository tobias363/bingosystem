using SimpleJSON;

public partial class APIManager
{
    private struct RealtimeClaimInfo
    {
        public string ClaimId;
        public string ClaimType;
        public JSONNode ClaimNode;
    }
}

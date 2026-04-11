using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using BestHTTP.JSON;
using BestHTTP.SocketIO;
using BestHTTP.SocketIO.Events;
using I2.Loc;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;

public class EventManager : MonoBehaviour
{
    #region PUBLIC_VARIABLES
    public static EventManager Instance = null;
    #endregion

    #region PRIVATE_VARIABLES
    #endregion

    #region UNITY_CALLBACKS
    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
        }
        else if (Instance != null)
        {
            Destroy(gameObject);
            return;
        }
    }
    #endregion

    #region DELEGATE_CALLBACKS
    #endregion

    #region PUBLIC_METHODS
    public void RefreshAuthToken(string refreshToken, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("refreshToken", refreshToken);
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);

        //Debug.Log("RefreshAccessToken Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("RefreshAccessToken", action, Json.Decode(jsonObj.toString()));
    }

    public void SwitchHall(string hallId, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("hallId", hallId);
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);

        Debug.Log("SwitchHall Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("SwitchHall", action, Json.Decode(jsonObj.toString()));
    }

    public void PlayerHallLimit(SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);

        Debug.Log("PlayerHallLimit Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("PlayerHallLimit", action, Json.Decode(jsonObj.toString()));
    }

    public void Login(bool forceLoin, string emailUsername, string password, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("forceLoin", forceLoin);
        //if (emailUsername.Contains("@"))
        //    jsonObj.put("email", emailUsername);
        //else
        //    jsonObj.put("username", emailUsername);
        jsonObj.put("name", emailUsername);
        jsonObj.put("password", password);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);
        jsonObj.put("firebaseToken", UIManager.Instance.gameAssetData.playerGameData.firebaseToken);

        Debug.Log("Login Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("LoginPlayer", action, Json.Decode(jsonObj.toString()));
    }

    public void LoginWithUniqueId(bool forceLoin, string id, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("forceLogin", forceLoin);
        jsonObj.put("id", id);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("LoginWithUniqueId Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("LoginWithUniqueId", action, Json.Decode(jsonObj.toString()));
    }

    public void LoginPlayer(bool forceLogin, string emailUsername, string password, /*string hallId, string hallName,*/ SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("forceLogin", forceLogin);
        //if (emailUsername.Contains("@"))
        //    jsonObj.put("email", emailUsername);
        //else
        //    jsonObj.put("username", emailUsername);
        jsonObj.put("name", emailUsername);
        jsonObj.put("password", password);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);
#if UNITY_STANDALONE_WIN
        jsonObj.put("firebaseToken", "windowsTrayApp");
#else
        jsonObj.put("firebaseToken", UIManager.Instance.gameAssetData.playerGameData.firebaseToken);
#endif
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        // jsonObj.put("hallId", hallId);
        // jsonObj.put("hallName", hallName);

        Debug.Log("New Login Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("LoginPlayer", action, Json.Decode(jsonObj.toString()));
    }

    public void GetPlayerDetails(string playerID, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", playerID);

        //Debug.Log("Player Details : " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("PlayerDetails", action, Json.Decode(jsonObj.toString()));
    }
    public void StopGameByPlayers(SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("StopGameByPlayers : " + jsonObj.toString());
        GameSocketManager.SocketGame1.Emit("StopGameByPlayers", action, Json.Decode(jsonObj.toString()));
    }
    public void TvscreenUrlForPlayers(SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        jsonObj.put("deviceType", Utility.Instance.OSname);

        Debug.Log("TvscreenUrlForPlayers : " + jsonObj.toString());
        GameSocketManager.SocketGame1.Emit("TvscreenUrlForPlayers", action, Json.Decode(jsonObj.toString()));
    }
    public void VerifyByBankId(string playerID, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", playerID);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("VerifyByBankId : " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("verifyByBankId", action, Json.Decode(jsonObj.toString()));
    }

    public void AdminHallDisplayLogin(Socket adminSocket, string roomId, string hallId, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("roomId", roomId);
        jsonObj.put("hallId", hallId);

        Debug.Log("AdminHallDisplayLogin Event: " + jsonObj.toString());
        adminSocket.Emit("AdminHallDisplayLogin", action, Json.Decode(jsonObj.toString()));
    }

    public void Signup(string username, string bankId, string email, string mobileNumber, string nickname, string dateOfBirth, string password, List<HallData> hallList, SocketIOAckCallback action, Texture2D front, Texture2D back)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("username", username);
        jsonObj.put("email", email);
        jsonObj.put("phone", mobileNumber);
        jsonObj.put("nickname", nickname);
        jsonObj.put("dob", dateOfBirth);
        jsonObj.put("password", password);
        jsonObj.put("bankId", bankId);
        //jsonObj.put("hall", JsonConvert.SerializeObject(hallList));
        jsonObj.put("hall", JsonUtility.ToJson(new ListJsonT<HallData>(hallList)));
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);

        string frontPhotoString = "";
        if (front != null)
            frontPhotoString = GetBase64String(front);
        jsonObj.put("photoFront", frontPhotoString);

        string backPhotoString = "";
        if (back != null)
            backPhotoString = GetBase64String(back);
        jsonObj.put("photoBack", backPhotoString);
        Debug.Log("RegisterPlayer Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("RegisterPlayer", action, Json.Decode(jsonObj.toString()));
    }


    internal IEnumerator ImageUpload(Texture2D front, Texture2D back, string front_Img_Path, string back_Img_Path, string front_Img_Name, string back_Img_Name)
    {
        WWWForm form = new WWWForm();
        form.AddField("appVersion", Utility.Instance.AppVersion);
        form.AddField("deviceId", Utility.Instance.DeviceId);
        form.AddField("os", Utility.Instance.OSname);
        form.AddField("language", Utility.Instance.CurrentLanguage);

        string frontPhotoString = "";
        if (front != null)
            frontPhotoString = GetBase64String(front);
        form.AddField("photoFront", frontPhotoString);
        //form.AddBinaryData("photoFront", File.ReadAllBytes(front_Img_Path), front_Img_Name);

        string backPhotoString = "";
        if (back != null)
            backPhotoString = GetBase64String(back);
        form.AddField("photoBack", backPhotoString);
        //form.AddBinaryData("photoBack", File.ReadAllBytes(back_Img_Path), back_Img_Name);

        Debug.Log($"ImageUpload API:");

        using (UnityWebRequest www = UnityWebRequest.Post($"{Constants.ServerDetails.BaseUrl}/player/profile/image/update ", form))
        {
            www.SetRequestHeader("Authorization", $"Bearer {UIManager.Instance.gameAssetData.playerGameData.authToken}");

            yield return www.SendWebRequest();

            if (www.result != UnityWebRequest.Result.Success)
            {
                Debug.Log(www.error);
                UIManager.Instance.profilePanel.ImageUpload_API_Response(www.downloadHandler.text);
            }
            else
            {
                Debug.Log($"ImageUpload response : {www.downloadHandler.text}");
                UIManager.Instance.profilePanel.ImageUpload_API_Response(www.downloadHandler.text);
            }
        }
    }

    internal IEnumerator SignUp_API(
        string username,
        string surname,
        string bankId,
        string email,
        string mobileNumber,
        string nickname,
        string dateOfBirth,
        string password,
        List<HallData> hallList,
        Texture2D front,
        Texture2D back,
        string front_Img_Path,
        string back_Img_Path,
        string front_Img_Name,
        string back_Img_Name,
        bool isPEP,
        bool residentialAddressInNorway,
        string pepName,
        string pepRelationship,
        string pepDateOfBirth,
        bool salary,
        bool propertySaleOrLease,
        bool stocks,
        bool socialSupport,
        bool giftsOrInheritance,
        bool other,
        bool isResidentialAddressInNorway,
        string cityName,
        string zipCode,
        string address,
        string country,
        bool playBySalary,
        bool playByPropertySaleOrLease,
        bool playByStocks,
        bool playBySocialSupport,
        bool playByGiftsOrInheritance,
        bool playByOther
    )
    {
        WWWForm form = new WWWForm();
        form.AddField("username", username);
        form.AddField("surname", surname);
        form.AddField("email", email);
        form.AddField("phone", mobileNumber);
        form.AddField("nickname", nickname);
        form.AddField("dob", dateOfBirth);
        form.AddField("password", password);
        form.AddField("bankId", bankId);
        //jsonObj.put("hall", JsonConvert.SerializeObject(hallList));
        form.AddField("hall", JsonUtility.ToJson(new ListJsonT<HallData>(hallList)));
        form.AddField("appVersion", Utility.Instance.AppVersion);
        form.AddField("deviceId", Utility.Instance.DeviceId);
        form.AddField("os", Utility.Instance.OSname);
        form.AddField("language", Utility.Instance.CurrentLanguage);
        form.AddField("isPEP", isPEP.ToString().ToLower());
        form.AddField("residentialAddressInNorway", residentialAddressInNorway.ToString().ToLower());
        form.AddField("pepName", pepName);
        form.AddField("pepRelationship", pepRelationship);
        form.AddField("pepDateOfBirth", pepDateOfBirth);
        form.AddField("salary", salary.ToString().ToLower());
        form.AddField("propertySaleOrLease", propertySaleOrLease.ToString().ToLower());
        form.AddField("stocks", stocks.ToString().ToLower());
        form.AddField("socialSupport", socialSupport.ToString().ToLower());
        form.AddField("giftsOrInheritance", giftsOrInheritance.ToString().ToLower());
        form.AddField("other", other.ToString().ToLower());
        form.AddField("isResidentialAddressInNorway", isResidentialAddressInNorway.ToString().ToLower());
        form.AddField("city", cityName);
        form.AddField("zipCode", zipCode);
        form.AddField("address", address);
        form.AddField("country", country);
        form.AddField("playBySalary", playBySalary.ToString().ToLower());
        form.AddField("playByPropertySaleOrLease", playByPropertySaleOrLease.ToString().ToLower());
        form.AddField("playByStocks", playByStocks.ToString().ToLower());
        form.AddField("playBySocialSupport", playBySocialSupport.ToString().ToLower());
        form.AddField("playByGiftsOrInheritance", playByGiftsOrInheritance.ToString().ToLower());
        form.AddField("playByOther", playByOther.ToString().ToLower());

        Debug.Log(
            $"SignUp API - All Fields: username={username}, surname={surname}, email={email}, phone={mobileNumber}, nickname={nickname}, dob={dateOfBirth}, password={password}, bankId={bankId}, hall={JsonUtility.ToJson(new ListJsonT<HallData>(hallList))}, appVersion={Utility.Instance.AppVersion}, deviceId={Utility.Instance.DeviceId}, os={Utility.Instance.OSname}, language={Utility.Instance.CurrentLanguage}, isPEP={isPEP}, residentialAddressInNorway={residentialAddressInNorway}, pepName={pepName}, pepRelationship={pepRelationship}, pepDateOfBirth={pepDateOfBirth}, salary={salary}, propertySaleOrLease={propertySaleOrLease}, stocks={stocks}, socialSupport={socialSupport}, giftsOrInheritance={giftsOrInheritance}, other={other}, isResidentofNorway={isResidentialAddressInNorway}, city={cityName}, zipCode={zipCode}, address={address}, country={country}, playBySalary={playBySalary}, playByPropertySaleOrLease={playByPropertySaleOrLease}, playByStocks={playByStocks}, playBySocialSupport={playBySocialSupport}, playByGiftsOrInheritance={playByGiftsOrInheritance}, playByOther={playByOther}"
        );

        string frontPhotoString = "";
        if (front != null)
            frontPhotoString = GetBase64String(front);
        form.AddField("photoFront", frontPhotoString);
        //form.AddBinaryData("photoFront", File.ReadAllBytes(front_Img_Path), front_Img_Name);

        string backPhotoString = "";
        if (back != null)
            backPhotoString = GetBase64String(back);
        form.AddField("photoBack", backPhotoString);
        //form.AddBinaryData("photoBack", File.ReadAllBytes(back_Img_Path), back_Img_Name);

        Debug.Log($"RegisterPlayer API:");

        using (UnityWebRequest www = UnityWebRequest.Post($"{Constants.ServerDetails.BaseUrl}/player/register", form))
        {
            yield return www.SendWebRequest();

            if (www.result != UnityWebRequest.Result.Success)
            {
                Debug.Log(www.error);
                UIManager.Instance.signupPanel.Signup_API_Response(www.downloadHandler.text);
            }
            else
            {
                Debug.Log($"Sign up response : {www.downloadHandler.text}");
                Debug.Log($"Sign up response : {pepDateOfBirth}");
                UIManager.Instance.signupPanel.Signup_API_Response(www.downloadHandler.text);
            }
        }
    }

    string GetBase64String(Texture2D texture)
    {
        byte[] bytes = texture.EncodeToPNG();
        string s = Convert.ToBase64String(bytes);
        return $"{s}";
    }

    public void PlayerForgetPassword(string emailUsername, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("email", emailUsername);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Forget Password Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("playerForgotPassword", action, Json.Decode(jsonObj.toString()));
    }

    public void UpdateFirebaseToken(string firebaseToken, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("firebaseToken", firebaseToken);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);

        //Debug.Log("UpdateFirebaseToken Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("UpdateFirebaseToken", action, Json.Decode(jsonObj.toString()));
    }

    public void PlayerChangePassword(string oldPassword, string newPassword, string verifyNewPassword, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("oldPassword", oldPassword);
        json.put("newPassword", newPassword);
        json.put("verifyNewPassword", verifyNewPassword);
        json.put("deviceId", Utility.Instance.DeviceId);
        json.put("os", Utility.Instance.OSname);

        Debug.Log($"playerChangePassword: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("playerChangePassword", action, Json.Decode(json.toString()));
    }

    public void PlayerProfile(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log($"PlayerProfile: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("Playerprofile", action, Json.Decode(json.toString()));
    }

    public void GetApprovedHallList(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log($"GetApprovedHallList: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("GetApprovedHallList", action, Json.Decode(json.toString()));
    }

    public void DeletePlayerAccount(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log($"DeletePlayerAccount  : {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("DeletePlayerAccount", action, Json.Decode(json.toString()));
    }

    public void Logout(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log($"Logout: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("Logout", action, Json.Decode(json.toString()));
    }

    public void DepositMoney(double amount, string setOperation, string userAgentData, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("amount", amount);
        json.put("operation", setOperation);
        json.put("appVersion", Utility.Instance.AppVersion);
        json.put("deviceId", Utility.Instance.DeviceId);
        json.put("os", Utility.Instance.OSname);
        json.put("userAgentData", userAgentData);
        Debug.Log($"DepositMoney: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("DepositMoney", action, Json.Decode(json.toString()));
    }

    public void GamePlanList(int game, string hall, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("game", game);
        json.put("hall", hall);

        Debug.Log($"GamePlanList: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("GamePlanList", action, Json.Decode(json.toString()));
    }

    public void Game2PlanList(int game, string hall, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("game", game);
        json.put("hall", hall);

        Debug.Log($"Game2PlanList: {json.toString()}");
        GameSocketManager.SocketGame2.Emit("Game2PlanList", action, Json.Decode(json.toString()));
    }

    public void Game3PlanList(int game, string hall, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("game", game);
        json.put("hall", hall);

        Debug.Log($"Game3PlanList: {json.toString()}");
        GameSocketManager.SocketGame3.Emit("Game3PlanList", action, Json.Decode(json.toString()));
    }

    internal void Game1Room(int gameType, string hall, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("game", gameType);
        json.put("hall", hall);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"Game1Room: {json.toString()}");
        GameSocketManager.SocketGame1.Emit("Game1Room", action, Json.Decode(json.toString()));
    }

    internal void Game2Room(int gameType, string hall, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("game", gameType);
        json.put("hall", hall);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"Game2Room: {json.toString()}");
        GameSocketManager.SocketGame2.Emit("Game2Room", action, Json.Decode(json.toString()));
    }

    internal void Game3Room(int gameType, string hall, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("game", gameType);
        json.put("hall", hall);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"Game3Room: {json.toString()}");
        GameSocketManager.SocketGame3.Emit("Game3Room", action, Json.Decode(json.toString()));
    }
    internal void IsGame5AvailbaleForVerifiedPlayer(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"isGameAvailbaleForVerifiedPlayer: {json.toString()}");
        GameSocketManager.SocketGame5.Emit("isGameAvailbaleForVerifiedPlayer", action, Json.Decode(json.toString()));
    }
    internal void IsGame4AvailbaleForVerifiedPlayer(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"isGameAvailbaleForVerifiedPlayer: {json.toString()}");
        //Debug.Log($"{GameSocketManager.SocketGame4.Namespace}");
        GameSocketManager.SocketGame4.Emit("isGameAvailbaleForVerifiedPlayer", action, Json.Decode(json.toString()));
    }

    public void HallGameList(string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);

        Debug.Log($"HallGameList: {json.toString()}");
        GameSocketManager.SocketGame1.Emit("HallGameList", action, Json.Decode(json.toString()));
    }

    public void VerifyPassword(string pass, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("password", pass);
        json.put("appVersion", Utility.Instance.AppVersion);
        json.put("deviceId", Utility.Instance.DeviceId);
        json.put("os", Utility.Instance.OSname);
        Debug.Log($"password: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("VerifyPassword", action, Json.Decode(json.toString()));
    }

    public void GetGame3PurchaseData(string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"GetGame3PurchaseData: {json.toString()}");
        GameSocketManager.SocketGame3.Emit("GetGame3PurchaseData", action, Json.Decode(json.toString()));
    }

    public void PurchaseGame3Tickets(string gameId, int ticketQty, string purchaseType, string voucherCode, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("ticketQty", ticketQty);
        json.put("purchaseType", purchaseType);
        json.put("voucherCode", voucherCode);

        Debug.Log($"PurchaseGame3Tickets: {json.toString()}");
        GameSocketManager.SocketGame3.Emit("PurchaseGame3Tickets", action, Json.Decode(json.toString()));
    }

    public void GetGame1PurchaseData(string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);

        Debug.Log($"GetGame1PurchaseData: {json.toString()}");
        GameSocketManager.SocketGame1.Emit("GetGame1PurchaseData", action, Json.Decode(json.toString()));
    }

    public void PurchaseGame1Tickets(string gameId, List<Game1TicketType> ticketList, string purchaseType, string voucherCode, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("purchaseType", purchaseType);
        json.put("voucherCode", voucherCode);
        json.put("language", Utility.Instance.CurrentLanguage);
        //foreach (Game1TicketType ticketData in ticketList)
        //    json.put(ticketData.ticketType, ticketData.currentQty);

        Game1PurchasedTicketsList game1purchasedTicketList = new Game1PurchasedTicketsList();
        foreach (Game1TicketType ticketData in ticketList)
        {
            Game1TicketSubTypeBuyData newTicketData = new Game1TicketSubTypeBuyData();
            newTicketData.ticketType = ticketData.ticketType;
            newTicketData.ticketQty = ticketData.currentQty;
            game1purchasedTicketList.list.Add(newTicketData);
        }
        json.put("purchasedTickets", JsonUtility.ToJson(game1purchasedTicketList));

        Debug.Log($"PurchaseGame1Tickets: {json.toString()}");
        GameSocketManager.SocketGame1.Emit("PurchaseGame1Tickets", action, Json.Decode(json.toString()));
    }

    public void Blind_PurchaseGame1Tickets(string gameId, int luckyNumber, List<Game1TicketPurchase> ticketList, string purchaseType, string voucherCode)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("luckyNumber", luckyNumber);
        json.put("purchaseType", purchaseType);
        json.put("voucherCode", voucherCode);
        json.put("playerTicketType", "Online");

        Game1PurchasedTicketsList game1purchasedTicketList = new Game1PurchasedTicketsList();

        int length = ticketList.Count;
        for (int i = 0; i < length; i++)
            game1purchasedTicketList.list.Add(new Game1TicketSubTypeBuyData(ticketList[i].ticketName, ticketList[i].ticketQty));

        json.put("purchasedTickets", JsonUtility.ToJson(game1purchasedTicketList));
        Debug.Log($"PurchaseGame1Tickets: {json.toString()}");
        // UIManager.Instance.DisplayLoader(true);
        GameSocketManager.SocketGame1.Emit("PurchaseGame1Tickets",
            (Socket socket, Packet packet, object[] args) =>
            {
                print($"Purchase Game 1 Tickets : {packet}");
                EventResponse res = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));
                if (res.status.ToLower().Equals("success"))
                {
                    if (UIManager.Instance.game1Panel.Game_1_Data.gameId == gameId)
                    {
                        UIManager.Instance.lobbyPanel.gamePlanPanel.OnGame1ButtonTap();
                    }
                    else
                        UIManager.Instance.topBarPanel.hallGameListPanel.game1PurchaseTicket.Back_Btn();

                    Debug.Log("1");
                    // UIManager.Instance.game1Panel.game1GamePlayPanel.Btn_Upcoming_Game_Buy_Tickets.interactable = true;

                    //UIManager.Instance.messagePopup.DisplayMessagePopupAutoHide(res.message, true);
                }
                else
                {
                    Debug.Log("2");

                    UIManager.Instance.topBarPanel.miniGamePlanPanel.ClosePanel();
                    UIManager.Instance.messagePopup.DisplayMessagePopup(res.message);
                }

                UIManager.Instance.selectPurchaseTypePanel.Close();
                UIManager.Instance.DisplayLoader(false);
            }, Json.Decode(json.toString()));
    }

    public void SwapTicket_Game_5(string ticketId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", UIManager.Instance.game5Panel.game5GamePlayPanel.game5Data.gameId);
        json.put("ticketId", ticketId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"SwapTicket: {json.toString()}");
        GameSocketManager.SocketGame5.Emit("SwapTicket", action, Json.Decode(json.toString()));
    }

    public void Replace_Elvis_Tickets(string gameId, string id1, string id2, int amount, string purchaseType, string voucherCode)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("ticketId1", id1);
        json.put("ticketId2", id2);
        json.put("replaceAmount", amount);
        json.put("purchaseType", purchaseType);
        json.put("voucherCode", voucherCode);
        json.put("playerTicketType", "Online");

        Debug.Log($"ReplaceElvisTickets: {json.toString()}");

        // UIManager.Instance.DisplayLoader(true);
        GameSocketManager.SocketGame1.Emit("ReplaceElvisTickets",
            (Socket socket, Packet packet, object[] args) =>
            {
                EventResponse res = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));
                if (res.status.ToLower().Equals("success"))
                {
                    UIManager.Instance.lobbyPanel.gamePlanPanel.OnGame1ButtonTap();
                    UIManager.Instance.topBarPanel.hallGameListPanel.game1ViewPurchaseTicket.gameObject.SetActive(false);
                    UIManager.Instance.messagePopup.DisplayMessagePopupAutoHide(res.message, true);
                }
                else
                {
                    UIManager.Instance.topBarPanel.miniGamePlanPanel.ClosePanel();
                    UIManager.Instance.messagePopup.DisplayMessagePopup(res.message);
                }

                UIManager.Instance.selectPurchaseTypePanel.Close();
                UIManager.Instance.DisplayLoader(false);
            }, Json.Decode(json.toString()));
    }

    public void CancelGameTickets(string namespaceString, string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"CancelGameTickets: {json.toString()}");
        GameSocketManager.socketManager.GetSocket("/" + namespaceString).Emit("CancelGameTickets", action, Json.Decode(json.toString()));
    }

    public void View_Game_1_Purchased_Tickets(string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"ViewPurchasedTickets: {json.toString()}");
        GameSocketManager.SocketGame1.Emit("ViewPurchasedTickets", action, Json.Decode(json.toString()));
    }

    public void Set_Auto_Lucky_Number_For_Game_1(int lucky_Number, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("luckyNumber", lucky_Number);
        json.put("isLuckyNumberEnabled", UIManager.Instance.settingPanel.Game_1_Lucky_Number_TG.isOn);

        Debug.Log($"SetLuckyNumber: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("SetLuckyNumber", action, Json.Decode(json.toString()));
    }

    public void Get_Auto_Lucky_Number_For_Game_1(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log($"GetLuckyNumber: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("GetLuckyNumber", action, Json.Decode(json.toString()));
    }

    public void Game_1_Replace_Elvis_Ticket(string gameId, string ticketId1, string ticketId2, string purchaseType, int replaceAmount, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("ticketId1", ticketId1);
        json.put("ticketId2", ticketId2);
        json.put("purchaseType", purchaseType);
        json.put("replaceAmount", replaceAmount);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"Game_1_Replace_Elvis_Ticket: {json.toString()}");
        GameSocketManager.SocketGame1.Emit("ReplaceElvisTickets", action, Json.Decode(json.toString()));
    }

    public void SubscribeRoom(string namespaceString, string gameId, string previousGameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("previousGameId", previousGameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Subscribe: " + json.toString());
        GameSocketManager.socketManager.GetSocket("/" + namespaceString).Emit("SubscribeRoom", action, Json.Decode(json.toString()));
    }

    public void SubscribeRoomGame1(string gameId, string previousGameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("previousGameId", previousGameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Subscribe Game 1: " + json.toString());
        GameSocketManager.SocketGame1.Emit("SubscribeRoom", action, Json.Decode(json.toString()));
    }

    public void SubscribeRoomGame2(string gameId, string previousGameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("previousGameId", previousGameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Subscribe Game 2: " + json.toString());
        GameSocketManager.SocketGame2.Emit("SubscribeRoom", action, Json.Decode(json.toString()));
    }

    public void UnSubscribeRoom(string namespaceString, string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("LeftRoom: " + json.toString());
        GameSocketManager.SocketGame1.Emit("LeftRoom", action, Json.Decode(json.toString()));
    }

    public void UnSubscribeGame2Room(string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("LeftRoom: " + json.toString());
        GameSocketManager.SocketGame2.Emit("LeftRoom", action, Json.Decode(json.toString()));
    }

    public void UnSubscribeGame3Room(string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Game 3 LeftRoom: " + json.toString());
        GameSocketManager.SocketGame3.Emit("LeftRoom", action, Json.Decode(json.toString()));
    }

    public void UnSubscribeGame5Room(string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Game 5 LeftRoom: " + json.toString());
        GameSocketManager.SocketGame5.Emit("LeftRoom", action, Json.Decode(json.toString()));
    }

    public void ApplyVoucherCode(Socket socket, string gameId, int ticketQty, string voucherCode, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("ticketQty", ticketQty);
        json.put("voucherCode", voucherCode);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"ApplyVoucherCode: {json.toString()}");
        socket.Emit("ApplyVoucherCode", action, Json.Decode(json.toString()));
    }

    public void Game4ThemesData(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("appVersion", Utility.Instance.AppVersion);
        json.put("os", Utility.Instance.OSname);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Game4ThemesData: " + json.toString());
        GameSocketManager.SocketGame4.Emit("Game4ThemesData", action, Json.Decode(json.toString()));
    }

    public void Game4Data(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Game4Data: " + json.toString());
        GameSocketManager.SocketGame4.Emit("Game4Data", action, Json.Decode(json.toString()));
    }

    public void Game5Data(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Game5Data: " + json.toString());
        GameSocketManager.SocketGame5.Emit("Game5Data", action, Json.Decode(json.toString()));
    }

    public void Game4ChangeTickets(string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Game4ChangeTickets: " + json.toString());
        GameSocketManager.SocketGame4.Emit("Game4ChangeTickets", action, Json.Decode(json.toString()));
    }

    public void Game4Play(string gameId, List<string> ticketList, int multiplierValue, int multiplierIndex, string purchaseType, string voucherCode, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("ticketList", Utility.Instance.StringListToJsonString(ticketList));
        json.put("multiplierValue", multiplierValue);
        json.put("multiplierIndex", multiplierIndex);
        json.put("purchaseType", purchaseType);
        json.put("voucherCode", voucherCode);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Game4Play: " + json.toString());
        GameSocketManager.SocketGame4.Emit("Game4Play", action, Json.Decode(json.toString()));
    }

    public void Game5Play(string gameId, List<(string id, int price)> ticketList, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        //Debug.Log("Game5Play ticketList count: " + ticketList.Count);
        // foreach (var ticket in ticketList)
        // {
        //     Debug.Log($"Ticket - ID: {ticket.id}, Price: {ticket.price}");
        // }
        json.put("purchasedTickets", Utility.Instance.StringListToJsonStringGame5(ticketList));
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Game5Play: " + json.toString());
        GameSocketManager.SocketGame5.Emit("Game5Play", action, Json.Decode(json.toString()));
    }

    public void WheelOfFortuneData(Socket socket, string gameId, SocketIOAckCallback action, string playerType = "Real")
    {
        JSON_Object json = new JSON_Object();
        json.put("playerType", playerType);
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("WheelOfFortuneData: " + json.toString());
        socket.Emit("WheelOfFortuneData", action, Json.Decode(json.toString()));
    }

    public void Game5WheelOfFortuneData(Socket socket, string gameId, string ticketId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("ticketId", ticketId);
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("WheelOfFortuneData: " + json.toString());
        socket.Emit("WheelOfFortuneData", action, Json.Decode(json.toString()));
    }

    public void Game5RouletteWheelData(Socket socket, string gameId, string ticketId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("ticketId", ticketId);
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("WheelOfFortuneData: " + json.toString());
        socket.Emit("WheelOfFortuneData", action, Json.Decode(json.toString()));
    }

    public void PlayWheelOfFortune(Socket socket, string gameId, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("PlayWheelOfFortune: " + json.toString());
        socket.Emit("PlayWheelOfFortune", action, Json.Decode(json.toString()));
    }

    public void WheelOfFortuneFinished(Socket socket, string gameId, long winningPrize, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("winningPrize", winningPrize);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("WheelOfFortuneFinished: " + json.toString());
        socket.Emit("WheelOfFortuneFinished", action, Json.Decode(json.toString()));
    }

    public void TreasureChestData(Socket socket, string gameId, SocketIOAckCallback action, string playerType = "Real")
    {
        JSON_Object json = new JSON_Object();
        json.put("playerType", playerType);
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("TreasureChestData: " + json.toString());
        socket.Emit("TreasureChestData", action, Json.Decode(json.toString()));
    }

    public void SelectTreasureChest(Socket socket, string gameId, SocketIOAckCallback action, string playerType = "Real")
    {
        if (!HasInternetConnection)
            return;

        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("playerType", playerType);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("SelectTreasureChest: " + json.toString());
        socket.Emit("SelectTreasureChest", action, Json.Decode(json.toString()));
    }

    public void SelectColorDraft(Socket socket, string gameId, string playerType, int turnCount, int selectedIndex, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("playerType", playerType);
        json.put("turnCount", turnCount);
        json.put("selectedIndex", selectedIndex);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("SelectColorDraft : " + json.toString());
        socket.Emit("SelectColorDraft", action, Json.Decode(json.toString()));
    }

    public void SelectMystery(Socket socket, string gameId, string playerType, int turnCount, bool isHigherNumber, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("playerType", playerType);
        json.put("turnCount", turnCount);
        json.put("isHigherNumber", isHigherNumber);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("SelectMystery : " + json.toString());
        socket.Emit("SelectMystery", action, Json.Decode(json.toString()));
    }

    public void SelectWofAuto(Socket socket, string gameId, string ticketId, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("ticketId", ticketId);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("SelectWofAuto: " + json.toString());
        socket.Emit("SelectWofAuto", action, Json.Decode(json.toString()));
    }

    public void SelectRouletteAuto(Socket socket, string gameId, string ticketId, string playerType, int spinCount, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("ticketId", ticketId);
        json.put("playerType", playerType);
        json.put("spinCount", spinCount);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("SelectRouletteAuto: " + json.toString());
        socket.Emit("SelectRouletteAuto", action, Json.Decode(json.toString()));
    }

    public void MysteryGameData(Socket socket, string gameId, SocketIOAckCallback action, string playerType = "Real")
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("playerType", playerType);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("MysteryGameData: " + json.toString());
        socket.Emit("MysteryGameData", action, Json.Decode(json.toString()));
    }

    public void MysteryGameFinished(Socket socket, string gameId, long winningPrize, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("winningPrize", winningPrize);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("MysteryGameFinished: " + json.toString());
        socket.Emit("MysteryGameFinished", action, Json.Decode(json.toString()));
    }

    public void ColorDraftGameData(Socket socket, string gameId, SocketIOAckCallback action, string playerType = "Real")
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("playerType", playerType);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("ColorDraftGameData: " + json.toString());
        socket.Emit("ColorDraftGameData", action, Json.Decode(json.toString()));
    }

    public void UpdateProfile(string userName, string surname, string nickname, string mobile, string email, string bankId, Texture2D /*string*/ imageBase64, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("username", userName);
        json.put("surname", surname);
        json.put("nickname", nickname);
        json.put("phone", mobile);
        json.put("email", email);
        json.put("bankId", bankId);

        string profilePic = "";
        if (imageBase64 != null)
        {
            profilePic = GetBase64String(imageBase64);
            json.put("profilePic", profilePic);
        }

        Debug.Log($"UpdateProfile: {json.toString()}");
        GameSocketManager.socketManager.Socket.Emit("UpdateProfile", action, Json.Decode(json.toString()));
    }

    public void SelectLuckyNumberGame1(string namespaceString, string gameId, int luckyNumber, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("gameId", gameId);
        jsonObj.put("luckyNumber", luckyNumber);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("SelectLuckyNumber Event: " + jsonObj.toString());
        GameSocketManager.SocketGame1.Emit("SelectLuckyNumber", action, Json.Decode(jsonObj.toString()));
    }

    public void SelectLuckyNumberGame2(string namespaceString, string gameId, int luckyNumber, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("gameId", gameId);
        jsonObj.put("luckyNumber", luckyNumber);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("SelectLuckyNumber Event: " + jsonObj.toString());
        GameSocketManager.SocketGame2.Emit("SelectLuckyNumber", action, Json.Decode(jsonObj.toString()));
    }

    public void SelectLuckyNumberGame3(string namespaceString, string gameId, int luckyNumber, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("gameId", gameId);
        jsonObj.put("luckyNumber", luckyNumber);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("SelectLuckyNumber Event: " + jsonObj.toString());
        GameSocketManager.SocketGame3.Emit("SelectLuckyNumber", action, Json.Decode(jsonObj.toString()));
    }

    public void GameChatHistory(string namespaceString, string gameId, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("gameId", gameId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("GameChatHistory Event: " + jsonObj.toString());
        GameSocketManager.socketManager.GetSocket("/" + namespaceString).Emit("GameChatHistory", action, Json.Decode(jsonObj.toString()));
    }

    public void SendGameChat(string namespaceString, string gameId, string message, int emojiId, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("gameId", gameId);
        jsonObj.put("message", message);
        jsonObj.put("emojiId", emojiId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("SendGameChat Event: " + jsonObj.toString());
        GameSocketManager.socketManager.GetSocket("/" + namespaceString).Emit("SendGameChat", action, Json.Decode(jsonObj.toString()));
    }

    public void GetCardDetails(SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log("GetCardDetails Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("GetCardDetails", action, Json.Decode(jsonObj.toString()));
    }

    public void DepositMoney(bool saveCard, string cardHolderName, string cardNumber, string cardExpiry, string cvv, double amount, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("saveCard", saveCard);
        jsonObj.put("cardHolderName", cardHolderName);
        jsonObj.put("cardNumber", cardNumber);
        jsonObj.put("cardExpiry", cardExpiry);
        jsonObj.put("cvv", cvv);
        jsonObj.put("amount", amount);

        Debug.Log("DepositMoney Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("DepositMoney", action, Json.Decode(jsonObj.toString()));
    }

    public void WithdrawMoney(double amount, string withdrawType, string password, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("amount", amount);
        jsonObj.put("withdrawType", withdrawType);
        jsonObj.put("password", password);

        Debug.Log("WithdrawMoney Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("WithdrawMoney", action, Json.Decode(jsonObj.toString()));
    }

    public void TransactionHistory(SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log("TransactionHistory Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("TransactionHistory", action, Json.Decode(jsonObj.toString()));
    }

    public void EnableNotification(bool enableNotification, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("flag", enableNotification);

        Debug.Log("EnableNotification Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("EnableNotification", action, Json.Decode(jsonObj.toString()));
    }

    public void updatePlayerLanguage(SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("language", Utility.Instance.UpdateLanguage);

        Debug.Log("updatePlayerLanguage Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("updatePlayerLanguage", action, Json.Decode(jsonObj.toString()));
    }

    public void SetLimit(long limit, SocketIOAckCallback action)
    {
        if (!HasInternetConnection) return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("limit", limit);

        Debug.Log("SetLimit Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("SetLimit", action, Json.Decode(jsonObj.toString()));
    }

    public void BlockMySelf(int days, SocketIOAckCallback action)
    {
        if (!HasInternetConnection) return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("days", days);

        Debug.Log("BlockMySelf Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("BlockMySelf", action, Json.Decode(jsonObj.toString()));
    }

    public void VoucherList(SocketIOAckCallback action)
    {
        if (!HasInternetConnection) return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log("VoucherList Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("VoucherList", action, Json.Decode(jsonObj.toString()));
    }

    public void RedeemVoucher(string voucherId, SocketIOAckCallback action)
    {
        if (!HasInternetConnection) return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("voucherId", voucherId);

        Debug.Log("RedeemVoucher Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("RedeemVoucher", action, Json.Decode(jsonObj.toString()));
    }

    public void HallList(SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", "");

        //Debug.Log("HallList Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("HallList", action, Json.Decode(jsonObj.toString()));
    }

    public void GetScreenSaverDetails(SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", "");

        //Debug.Log("ScreenSaver Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("ScreenSaver", action, Json.Decode(jsonObj.toString()));
    }

    public void GameStatistics(SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log("GameStatistics Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("GameStatistics", action, Json.Decode(jsonObj.toString()));
    }
    public void MyWinnings(string filter_by, string date, string game_type, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("filter_by", filter_by);
        jsonObj.put("date", date);
        jsonObj.put("game_type", game_type);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log("MyWinnings Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("myWinnings", action, Json.Decode(jsonObj.toString()));
    }

    public void LastHourLossProfit(SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log("LastHourLossProfit Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("lastHourLossProfit", action, Json.Decode(jsonObj.toString()));
    }

    public void CheckPlayerBreakTime(string gameType, SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        jsonObj.put("gameType", gameType);

        Debug.Log("CheckPlayerBreakTime Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("CheckPlayerBreakTime", action, Json.Decode(jsonObj.toString()));
    }

    public void PlayerNotifications(SocketIOAckCallback action)
    {
        if (!HasInternetConnection) return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log("playerNotifications Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("PlayerNotifications", action, Json.Decode(jsonObj.toString()));
    }

    public void Leaderboard(SocketIOAckCallback action)
    {
        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log("Leaderboard Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("Leaderboard", action, Json.Decode(jsonObj.toString()));
    }

    public void FAQ(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("slug", "faq");
        Debug.Log($"FAQ: {json.toString()}");

        GameSocketManager.socketManager.Socket.Emit("FAQ", action, Json.Decode(json.toString()));
    }

    public void Terms(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("slug", "terms_and_condition");
        Debug.Log($"Terms: {json.toString()}");

        GameSocketManager.socketManager.Socket.Emit("Terms", action, Json.Decode(json.toString()));
    }

    public void Aboutus(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("slug", "about_us");
        Debug.Log($"Aboutus: {json.toString()}");

        GameSocketManager.socketManager.Socket.Emit("Aboutus", action, Json.Decode(json.toString()));
    }

    public void ResponsibleGameing(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("slug", "responsible_gameing");
        Debug.Log($"ResponsibleGameing: {json.toString()}");

        GameSocketManager.socketManager.Socket.Emit("ResponsibleGameing", action, Json.Decode(json.toString()));
    }

    public void Links(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("slug", "links");
        Debug.Log($"Links: {json.toString()}");

        GameSocketManager.socketManager.Socket.Emit("Links", action, Json.Decode(json.toString()));
    }

    public void Support(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("slug", "support");
        Debug.Log($"Support: {json.toString()}");

        GameSocketManager.socketManager.Socket.Emit("Support", action, Json.Decode(json.toString()));
    }

    public void Home(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        Debug.Log($"Home: {json.toString()}");

        GameSocketManager.socketManager.Socket.Emit("Home", action, Json.Decode(json.toString()));
    }

    public void Game2TicketPurchaseData(string gameId, SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("gameId", gameId);
        jsonObject.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Namespace: " + GameSocketManager.SocketGame2.Namespace);
        Debug.Log("Game2TicketPurchaseData: " + jsonObject.toString());
        GameSocketManager.SocketGame2.Emit("Game2TicketPurchaseData", action, Json.Decode(jsonObject.toString()));
    }

    public void Game2TicketPurchaseData(string parentGameId, string subGameId, SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("parentGameId", parentGameId);
        jsonObject.put("subGameId", subGameId);

        Debug.Log("Namespace: " + GameSocketManager.SocketGame2.Namespace);
        Debug.Log("Game2TicketPurchaseData: " + jsonObject.toString());
        GameSocketManager.SocketGame2.Emit("Game2TicketPurchaseData", action, Json.Decode(jsonObject.toString()));
    }

    public void Game2BuyTickets(string gameId, string sub_Game_ID, int luckyNumber, List<string> ticketNumberList, bool autoPlay, string purchaseType, string voucherCode, SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("parentGameId", gameId);
        jsonObject.put("subGameId", sub_Game_ID);
        jsonObject.put("luckyNumber", luckyNumber);
        //jsonObject.put("ticketNumberList", JsonConvert.SerializeObject(ticketNumberList));
        jsonObject.put("ticketNumberList", Utility.Instance.StringListToJsonString(ticketNumberList));
        jsonObject.put("autoPlay", autoPlay);
        jsonObject.put("purchaseType", purchaseType);
        jsonObject.put("voucherCode", voucherCode);
        jsonObject.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log("Game2BuyTickets: " + jsonObject.toString());
        GameSocketManager.SocketGame2.Emit("Game2BuyTickets", action, Json.Decode(jsonObject.toString()));
    }

    public void CancelTicketGame1(string gameId, string ticketId1, string ticketId2, string ticketId3, SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", gameId);
        json.put("ticketId1", ticketId1);
        json.put("ticketId2", ticketId2);
        json.put("ticketId3", ticketId3);
        json.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"CancelTicketGame1: {json.toString()}");
        GameSocketManager.SocketGame1.Emit("CancelTicket", action, Json.Decode(json.toString()));
    }

    public void CancelTicketGame3(string sub_Game_ID, string ticketId, SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("gameId", sub_Game_ID);
        jsonObject.put("ticketId", ticketId);
        jsonObject.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"CancelTicket : {jsonObject.toString()}");
        GameSocketManager.SocketGame3.Emit("CancelTicket", action, Json.Decode(jsonObject.toString()));
    }

    public void CancelTicketGame2(string sub_Game_ID, string ticketId, SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("gameId", sub_Game_ID);
        jsonObject.put("ticketId", ticketId);
        jsonObject.put("language", Utility.Instance.CurrentLanguage);

        Debug.Log($"CancelTicket : {jsonObject.toString()}");
        GameSocketManager.SocketGame2.Emit("CancelTicket", action, Json.Decode(jsonObject.toString()));
    }

    public void Game1CancelTickets(string game_ID)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("gameId", game_ID);
        jsonObject.put("language", Utility.Instance.CurrentLanguage);

        GameSocketManager.SocketGame1.Emit("CancelGame1Tickets", (socket, packet, args) =>
        {
            print($"CANCEL : {packet.ToString()}");

            EventResponse res = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));
            if (res.status.ToLower().Equals("success"))
            {
                UIManager.Instance.topBarPanel.OnMiniGamePlanPanelButtonTap();
                if (UIManager.Instance.game1Panel.Game_1_Data.gameId == game_ID)
                    UIManager.Instance.lobbyPanel.gamePlanPanel.OnGame1ButtonTap();
                else
                    UIManager.Instance.topBarPanel.hallGameListPanel.Open();

                //UIManager.Instance.game2Panel.game2PlayPanel.Clear_Tickets(game_ID);
                //UIManager.Instance.game2Panel.game2PlayPanel.Clear_Luck_Number(game_ID);
            }

            PlayerHallLimit((socket, packet, args) =>
                    {
                        Debug.Log("PlayerHallLimit: " + packet.ToString());
                        EventResponse<PlayerApprovedHallsResponse> response = JsonUtility.FromJson<EventResponse<PlayerApprovedHallsResponse>>(Utility.Instance.GetPacketString(packet));
                        if (response.status == Constants.EventStatus.SUCCESS)
                        {
                            UIManager.Instance.topBarPanel.SetSwitchHallDropdown(response.result.approvedHalls);
                        }
                        else
                        {
                            UIManager.Instance.messagePopup.DisplayMessagePopup(response.message);
                        }
                    });
            //UIManager.Instance.messagePopup.DisplayMessagePopup(res.message);

        }, Json.Decode(jsonObject.toString()));
    }

    public void Game2CancelTickets(string sub_Game_ID)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("parentGameId", UIManager.Instance.game2Panel.Game_2_Data.gameId);
        jsonObject.put("subGameId", sub_Game_ID);
        jsonObject.put("language", Utility.Instance.CurrentLanguage);

        GameSocketManager.SocketGame2.Emit("CancelGameTickets", (socket, packet, args) =>
        {
            print($"CANCEL : {packet.ToString()}");

            EventResponse res = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));
            if (res.status.ToLower().Equals("success"))
            {
                //UIManager.Instance.topBarPanel.miniGamePlanPanel.OpenGame2List();
                UIManager.Instance.game2Panel.game2PlayPanel.Clear_Tickets(sub_Game_ID);
                UIManager.Instance.game2Panel.game2PlayPanel.Clear_Luck_Number(sub_Game_ID);
                PlayerHallLimit((socket, packet, args) =>
            {
                Debug.Log("PlayerHallLimit: " + packet.ToString());
                EventResponse<PlayerApprovedHallsResponse> response = JsonUtility.FromJson<EventResponse<PlayerApprovedHallsResponse>>(Utility.Instance.GetPacketString(packet));
                if (response.status == Constants.EventStatus.SUCCESS)
                {
                    UIManager.Instance.topBarPanel.SetSwitchHallDropdown(response.result.approvedHalls);
                }
                else
                {
                    UIManager.Instance.messagePopup.DisplayMessagePopup(response.message);
                }
            });
            }
            else
            {
                UIManager.Instance.messagePopup.DisplayMessagePopup(res.message);
            }

            ////UIManager.Instance.messagePopup.DisplayMessagePopup(res.message);

        }, Json.Decode(jsonObject.toString()));
    }

    public void Game3CancelTickets(string sub_Game_ID)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("parentGameId", UIManager.Instance.game2Panel.Game_2_Data.gameId);
        jsonObject.put("subGameId", sub_Game_ID);

        GameSocketManager.SocketGame3.Emit("CancelGameTickets", (socket, packet, args) =>
        {
            print($"CANCEL : {packet.ToString()}");

            EventResponse res = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));
            if (res.status.ToLower().Equals("success"))
            {
                // UIManager.Instance.topBarPanel.miniGamePlanPanel.OpenGame3List();
                UIManager.Instance.game3Panel.game3GamePlayPanel.Clear_Tickets(sub_Game_ID);
                UIManager.Instance.game3Panel.game3GamePlayPanel.Clear_Luck_Number(sub_Game_ID);
                UIManager.Instance.game3Panel.game3GamePlayPanel.Clear_totat_Bet_Amount(sub_Game_ID);
                UIManager.Instance.topBarPanel.miniGamePlanPanel.Close();
            }

            PlayerHallLimit((socket, packet, args) =>
        {
            Debug.Log("PlayerHallLimit: " + packet.ToString());
            EventResponse<PlayerApprovedHallsResponse> response = JsonUtility.FromJson<EventResponse<PlayerApprovedHallsResponse>>(Utility.Instance.GetPacketString(packet));
            if (response.status == Constants.EventStatus.SUCCESS)
            {
                UIManager.Instance.topBarPanel.SetSwitchHallDropdown(response.result.approvedHalls);
            }
            else
            {
                UIManager.Instance.messagePopup.DisplayMessagePopup(response.message);
            }
        });
            //UIManager.Instance.messagePopup.DisplayMessagePopup(res.message);

        }, Json.Decode(jsonObject.toString()));
    }

    public void Game2BlindPurchase(string purchaseType, string voucherCode)
    {
        // UIManager.Instance.DisplayLoader(true);
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("parentGameId", UIManager.Instance.game2Panel.Game_2_Data.gameId);
        jsonObject.put("subGameId", UIManager.Instance.game2Panel.Sub_Game_ID_For_Blind_Purchase);
        jsonObject.put("luckyNumber", UIManager.Instance.game2Panel.Sub_Game_Lucky_Number_For_Blind_Purchase);
        jsonObject.put("ticketCount", UIManager.Instance.game2Panel.Blind_Ticket_Count);
        jsonObject.put("purchaseType", purchaseType);
        jsonObject.put("voucherCode", voucherCode);
        jsonObject.put("language", Utility.Instance.CurrentLanguage);
        GameSocketManager.SocketGame2.Emit("Game2BuyBlindTickets", (socket, packet, args) =>
        {
            Debug.Log("Game2BuyBlindTickets Responce : " + packet.ToString());
            EventResponse res = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));
            if (res.status.ToLower().Equals("success"))
            {
                UIManager.Instance.lobbyPanel.gamePlanPanel.OnGame2ButtonTap();
                ////UIManager.Instance.messagePopup.DisplayMessagePopupAutoHide(res.message, true);
            }
            else
            {
                UIManager.Instance.topBarPanel.miniGamePlanPanel.ClosePanel();
                UIManager.Instance.messagePopup.DisplayMessagePopup(res.message);
            }

            UIManager.Instance.selectPurchaseTypePanel.Close();
            UIManager.Instance.DisplayLoader(false);
        }, Json.Decode(jsonObject.toString()));
    }

    public void Game3Purchase(string purchaseType, string voucherCode)
    {
        // UIManager.Instance.DisplayLoader(true);
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("parentGameId", UIManager.Instance.game3Panel.Game_3_Data.gameId);
        jsonObject.put("subGameId", UIManager.Instance.game3Panel.Sub_Game_ID_For_Purchase);
        jsonObject.put("ticketQty", UIManager.Instance.game3Panel.Puchase_Ticket_Count);
        jsonObject.put("purchaseType", purchaseType);
        jsonObject.put("voucherCode", voucherCode);
        jsonObject.put("language", Utility.Instance.CurrentLanguage);
        GameSocketManager.SocketGame3.Emit("PurchaseGame3Tickets", (socket, packet, args) =>
        {
            print($"PurchaseGame3Tickets Response : {packet.ToString()}");
            EventResponse res = JsonUtility.FromJson<EventResponse>(Utility.Instance.GetPacketString(packet));
            if (res.status.ToLower().Equals("success"))
            {
                UIManager.Instance.lobbyPanel.gamePlanPanel.OnGame3ButtonTap();
                ////UIManager.Instance.messagePopup.DisplayMessagePopupAutoHide(res.message, true);
            }
            else
            {
                UIManager.Instance.topBarPanel.miniGamePlanPanel.ClosePanel();
                UIManager.Instance.messagePopup.DisplayMessagePopup(res.message);
            }

            UIManager.Instance.selectPurchaseTypePanel.Close();
            UIManager.Instance.DisplayLoader(false);
        }, Json.Decode(jsonObject.toString()));
    }

    public void PlayerUpdateInterval(SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        //Debug.Log("PlayerData: " + jsonObject.toString());
        GameSocketManager.socketManager.Socket.Emit("PlayerUpdateInterval", action, Json.Decode(jsonObject.toString()));
    }

    public void ReconnectPlayer(SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("deviceId", Utility.Instance.DeviceId);
        jsonObject.put("os", Utility.Instance.OSname);
        jsonObject.put("firebaseToken", UIManager.Instance.gameAssetData.playerGameData.firebaseToken);

        //Debug.Log("ReconnectPlayer: " + jsonObject.toString());
        GameSocketManager.socketManager.Socket.Emit("ReconnectPlayer", action, Json.Decode(jsonObject.toString()));
    }

    internal void GameTypeList(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        GameSocketManager.socketManager.Socket.Emit("GameTypeList", action, Json.Decode(json.toString()));
    }


    internal void AvailableGames(SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObject.put("hallId", UIManager.Instance.Player_Hall_ID);
        Debug.Log("AvailableGames: " + jsonObject.toString());
        GameSocketManager.socketManager.Socket.Emit("AvailableGames", action, Json.Decode(jsonObject.toString()));
    }

    internal void Game1Status(SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("playerId", UIManager.Instance.gameAssetData.PlayerId);

        Debug.Log("Game1Status: " + jsonObject.toString());
        GameSocketManager.socketManager.Socket.Emit("Game1Status", action, Json.Decode(jsonObject.toString()));
    }

    internal void IsHallClosed(SocketIOAckCallback action)
    {
        JSON_Object jsonObject = new JSON_Object();
        jsonObject.put("hallId", UIManager.Instance.gameAssetData.playerCredentials.hallId);

        Debug.Log("IsHallClosed: " + jsonObject.toString());

        GameSocketManager.socketManager.Socket.Emit("IsHallClosed", action, Json.Decode(jsonObject.toString()));
    }

    internal void Game1List(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("gameId", UIManager.Instance.game1Panel.Game_1_Data.gameId);
        json.put("language", Utility.Instance.CurrentLanguage);
        //json.put("hallId", UIManager.Instance.Player_Hall_ID);
        print($"Game 1 List : {json.toString()}");
        GameSocketManager.socketManager.GetSocket("/Game1").Emit("UpcomingGames", action, Json.Decode(json.toString()));
    }

    internal void Game2List(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("language", Utility.Instance.CurrentLanguage);
        if (Utility.Instance.IsSplitScreenSupported)
            json.put("gameId", UIManager.Instance.splitScreenGameManager.game2Panel.GameId);
        else
            json.put("gameId", UIManager.Instance.game2Panel.GameId);
        json.put("hallId", UIManager.Instance.Player_Hall_ID);
        print($"Game 2 List : {json.toString()}");
        GameSocketManager.socketManager.GetSocket("/Game2").Emit("Game2PlanList", action, Json.Decode(json.toString()));
    }

    internal void Game3List(SocketIOAckCallback action)
    {
        JSON_Object json = new JSON_Object();
        json.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        json.put("language", Utility.Instance.CurrentLanguage);
        if (Utility.Instance.IsSplitScreenSupported)
            json.put("gameId", UIManager.Instance.splitScreenGameManager.game3Panel.GameId);
        else
            json.put("gameId", UIManager.Instance.game3Panel.GameId);
        json.put("hallId", UIManager.Instance.Player_Hall_ID);
        print($"Game 3 List : {json.toString()}");
        GameSocketManager.SocketGame3.Emit("Game3PlanList", action, Json.Decode(json.toString()));
    }
    //PlayerSettings
    public void PlayerSettings(SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);

        Debug.Log("PlayerSettings Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("PlayerSettings", action, Json.Decode(jsonObj.toString()));
    }
    //PlayerSoundAndVoiceSettings
    public void PlayerSoundAndVoiceSettings(string settingType, int settingValue, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        jsonObj.put("settingType", settingType);
        jsonObj.put("settingValue", settingValue);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);
        jsonObj.put("deviceId", Utility.Instance.DeviceId);
        jsonObj.put("os", Utility.Instance.OSname);

        Debug.Log("PlayerSoundAndVoiceSettings Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("PlayerSoundAndVoiceSettings", action, Json.Decode(jsonObj.toString()));
    }
    public void AddOrUpdateBlockRule(string newRules, SocketIOAckCallback action)
    {
        if (!HasInternetConnection)
            return;

        JSON_Object jsonObj = new JSON_Object();
        jsonObj.put("playerId", UIManager.Instance.gameAssetData.PlayerId);
        jsonObj.put("newRules", newRules);
        jsonObj.put("language", Utility.Instance.CurrentLanguage);
        jsonObj.put("appVersion", Utility.Instance.AppVersion);

        Debug.Log("AddOrUpdateBlockRule Event: " + jsonObj.toString());
        GameSocketManager.socketManager.Socket.Emit("AddOrUpdateBlockRule", action, Json.Decode(jsonObj.toString()));
    }


    #endregion

    #region PRIVATE_METHODS
    #endregion

    #region COROUTINES
    #endregion

    #region GETTER_SETTER
    public bool HasInternetConnection
    {
        get
        {
            if (Application.internetReachability == NetworkReachability.NotReachable)
            {
                UIManager.Instance.DisplayLoader(false);
#if UNITY_WEBGL
                if (UIManager.Instance.isGameWebGL)
                {
                    UIManager.Instance.messagePopup.DisplayMessagePopup(Constants.LanguageKey.NoInternetConnectionMessage);
                }
                else
                {
                    UIManager.Instance.messagePopup.DisplayMessagePopup(Constants.LanguageKey.NoInternetConnectionMessage);
                }
#else
                UIManager.Instance.messagePopup.DisplayMessagePopup(Constants.LanguageKey.NoInternetConnectionMessage);
#endif
                return false;
            }
            return true;
        }
    }
    #endregion
}

using System.Collections;
using UnityEngine;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using TMPro;
using UnityEngine.UI; 
using SimpleJSON;

public class LoginManager : MonoBehaviour
{
    public TMP_InputField usernameInput;
    public TMP_InputField passwordInput;
    public Button loginButton; 
    public TextMeshProUGUI balanceText;
    private string token;
    private string userId;

    void Start()
    {
        loginButton.onClick.AddListener(OnLoginButtonClicked);
    }

    private async void OnLoginButtonClicked()
    {
        string username = usernameInput.text;
        string password = passwordInput.text;

        if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
        {
            Debug.Log("Please enter both username and password.");
            return;
        }

        using (HttpClient client = new HttpClient())
        {
            var requestData = new { username = username, password = password };
            string json = JsonUtility.ToJson(requestData);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            HttpResponseMessage response = await client.PostAsync("https://spillorama.aistechnolabs.info/user/login", content);
            string responseString = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var responseJson = JSON.Parse(responseString);
                token = responseJson["token"];
                userId = responseJson["userId"];
                Debug.Log("Login successful!");
                Debug.Log("Token: " + token);

                // Automatically get the balance after login
                await GetBalanceAsync();
            }
            else
            {
                Debug.Log("Login failed: " + responseString);
            }
        }
    }

    private async Task GetBalanceAsync()
    {
        if (string.IsNullOrEmpty(token))
        {
            Debug.Log("You must be logged in to get balance.");
            return;
        }

        using (HttpClient client = new HttpClient())
        {
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            HttpResponseMessage response = await client.GetAsync("https://spillorama.aistechnolabs.info/user/balance");
            string responseString = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var responseJson = JSON.Parse(responseString);
                float walletAmount = responseJson["walletAmount"].AsFloat;
                balanceText.text = "Balance: " + walletAmount;
                Debug.Log("Balance retrieved successfully!");
            }
            else
            {
                Debug.Log("Failed to get balance: " + responseString);
            }
        }
    }

    public async Task AddBalanceAsync(float amount, string remark)
    {
        if (string.IsNullOrEmpty(token))
        {
            Debug.Log("You must be logged in to add balance.");
            return;
        }

        using (HttpClient client = new HttpClient())
        {
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var requestData = new { amount = amount, remark = remark };
            string json = JsonUtility.ToJson(requestData);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            HttpResponseMessage response = await client.PostAsync("https://spillorama.aistechnolabs.info/user/balance/add", content);
            string responseString = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var responseJson = JSON.Parse(responseString);
                float walletAmount = responseJson["walletAmount"].AsFloat;
                balanceText.text = "Balance: " + walletAmount;
                Debug.Log("Balance added successfully!");
            }
            else
            {
                Debug.Log("Failed to add balance: " + responseString);
            }
        }
    }

    public async Task DeductBalanceAsync(float amount, string remark)
    {
        if (string.IsNullOrEmpty(token))
        {
            Debug.Log("You must be logged in to deduct balance.");
            return;
        }

        using (HttpClient client = new HttpClient())
        {
            client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var requestData = new { amount = amount, remark = remark };
            string json = JsonUtility.ToJson(requestData);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            HttpResponseMessage response = await client.PostAsync("https://spillorama.aistechnolabs.info/user/balance/deduct", content);
            string responseString = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var responseJson = JSON.Parse(responseString);
                float walletAmount = responseJson["walletAmount"].AsFloat;
                balanceText.text = "Balance: " + walletAmount;
                Debug.Log("Balance deducted successfully!");
            }
            else
            {
                Debug.Log("Failed to deduct balance: " + responseString);
            }
        }
    }
}

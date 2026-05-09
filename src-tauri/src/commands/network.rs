//! Public IP / geo lookup for the dashboard "where am I" card.
//!
//! Uses `ipwho.is` — no API key, HTTPS, JSON.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicIpInfo {
    pub ip: Option<String>,
    pub country: Option<String>,
    pub city: Option<String>,
    pub isp: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn lookup_public_ip() -> PublicIpInfo {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return PublicIpInfo {
                ip: None,
                country: None,
                city: None,
                isp: None,
                error: Some(format!("http client: {e}")),
            };
        }
    };

    match client.get("https://ipwho.is/").send().await {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(v) => {
                let success = v.get("success").and_then(|x| x.as_bool()).unwrap_or(false);
                if !success {
                    return PublicIpInfo {
                        ip: None,
                        country: None,
                        city: None,
                        isp: None,
                        error: v
                            .get("message")
                            .and_then(|m| m.as_str())
                            .map(String::from)
                            .or_else(|| Some("lookup failed".into())),
                    };
                }
                PublicIpInfo {
                    ip: v
                        .get("ip")
                        .and_then(|x| x.as_str())
                        .map(String::from),
                    country: v
                        .get("country")
                        .and_then(|x| x.as_str())
                        .map(String::from),
                    city: v.get("city").and_then(|x| x.as_str()).map(String::from),
                    isp: v
                        .get("connection")
                        .and_then(|c| c.get("isp"))
                        .and_then(|x| x.as_str())
                        .map(String::from),
                    error: None,
                }
            }
            Err(e) => PublicIpInfo {
                ip: None,
                country: None,
                city: None,
                isp: None,
                error: Some(format!("json: {e}")),
            },
        },
        Err(e) => PublicIpInfo {
            ip: None,
            country: None,
            city: None,
            isp: None,
            error: Some(format!("request: {e}")),
        },
    }
}

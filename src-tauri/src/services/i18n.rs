//! Minimal translation lookup for text produced by the backend (tray menu,
//! native notifications). Reads the same locale files as the frontend so
//! there is a single source of truth: `src/locales/{en,ar}.json`.

use std::sync::LazyLock;

use serde_json::Value;

static EN: LazyLock<Value> =
    LazyLock::new(|| serde_json::from_str(include_str!("../../../src/locales/en.json")).expect("valid en.json"));
static AR: LazyLock<Value> =
    LazyLock::new(|| serde_json::from_str(include_str!("../../../src/locales/ar.json")).expect("valid ar.json"));

fn lookup<'a>(root: &'a Value, key: &str) -> Option<&'a str> {
    let mut node = root;
    for part in key.split('.') {
        node = node.get(part)?;
    }
    node.as_str()
}

/// CLDR plural category (the subset i18next uses for en/ar).
pub fn plural_category(lang: &str, n: i64) -> &'static str {
    if lang == "ar" {
        let m = n % 100;
        match n {
            0 => "zero",
            1 => "one",
            2 => "two",
            _ if (3..=10).contains(&m) => "few",
            _ if (11..=99).contains(&m) => "many",
            _ => "other",
        }
    } else if n == 1 {
        "one"
    } else {
        "other"
    }
}

/// Translates `key`, interpolating `{{name}}` placeholders. If a `count`
/// variable is present, plural forms (`key_one`, `key_other`, …) are used.
pub fn t(lang: &str, key: &str, vars: &[(&str, String)]) -> String {
    let root: &Value = if lang == "ar" { &AR } else { &EN };
    let count = vars.iter().find(|(k, _)| *k == "count").and_then(|(_, v)| v.parse::<i64>().ok());
    let plural_key = count.map(|n| format!("{key}_{}", plural_category(lang, n)));
    let template = plural_key
        .as_deref()
        .and_then(|k| lookup(root, k))
        .or_else(|| plural_key.as_deref().and_then(|k| lookup(root, &k.replace(&format!("_{}", plural_category(lang, count.unwrap_or(0))), "_other"))))
        .or_else(|| lookup(root, key))
        .or_else(|| lookup(&EN, key))
        .unwrap_or(key);
    let mut out = template.to_string();
    for (name, value) in vars {
        out = out.replace(&format!("{{{{{name}}}}}"), value);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arabic_plural_categories() {
        let cats: Vec<&str> = [0, 1, 2, 3, 10, 11, 99, 100, 101, 103].iter().map(|&n| plural_category("ar", n)).collect();
        assert_eq!(cats, vec!["zero", "one", "two", "few", "few", "many", "many", "other", "other", "few"]);
        assert_eq!(plural_category("en", 1), "one");
        assert_eq!(plural_category("en", 0), "other");
    }

    #[test]
    fn translates_tray_labels_in_both_languages() {
        assert_eq!(t("en", "tray.quit", &[]), "Quit SnapVault");
        assert_ne!(t("ar", "tray.quit", &[]), t("en", "tray.quit", &[]));
        assert_eq!(t("en", "missing.key", &[]), "missing.key");
    }

    #[test]
    fn interpolates_and_pluralizes() {
        assert_eq!(t("en", "native.imported", &[("count", "1".into())]), "1 screenshot imported");
        assert_eq!(t("en", "native.imported", &[("count", "10".into())]), "10 screenshots imported");
        let ar = t("ar", "native.imported", &[("count", "3".into())]);
        assert!(ar.contains('3'));
    }
}

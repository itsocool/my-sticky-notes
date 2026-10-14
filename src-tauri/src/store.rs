use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

pub type Result<T> = std::result::Result<T, String>;
const COLORS: [&str; 7] = [
    "yellow", "green", "pink", "purple", "blue", "gray", "charcoal",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub document: Value,
    pub plain_text: String,
    pub color: String,
    pub pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub label: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub is_open: bool,
}

pub struct Store(Mutex<Connection>);

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn row_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    let document: String = row.get(1)?;
    let value = serde_json::from_str(&document).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(Note {
        id: row.get(0)?,
        document: value,
        plain_text: row.get(2)?,
        color: row.get(3)?,
        pinned: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        Self::initialize(Connection::open(path).map_err(|e| e.to_string())?)
    }

    #[cfg(test)]
    pub fn memory() -> Result<Self> {
        Self::initialize(Connection::open_in_memory().map_err(|e| e.to_string())?)
    }

    fn initialize(mut connection: Connection) -> Result<Self> {
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if version > 1 {
            return Err("이 데이터는 더 새로운 앱 버전으로 저장되었습니다.".into());
        }
        connection
            .execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;")
            .map_err(|e| e.to_string())?;
        if version == 0 {
            let tx = connection.transaction().map_err(|e| e.to_string())?;
            tx.execute_batch("CREATE TABLE notes (id TEXT PRIMARY KEY, document TEXT NOT NULL, plain_text TEXT NOT NULL, color TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
            CREATE TABLE windows (label TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, width REAL NOT NULL, height REAL NOT NULL, is_open INTEGER NOT NULL);
            PRAGMA user_version=1;").map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
        }
        Ok(Self(Mutex::new(connection)))
    }

    fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        self.0
            .lock()
            .map_err(|_| "메모 저장소에 접근할 수 없습니다.".into())
    }

    pub fn list(&self) -> Result<Vec<Note>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare("SELECT id, document, plain_text, color, pinned, created_at, updated_at FROM notes ORDER BY updated_at DESC, id ASC").map_err(|e| e.to_string())?;
        statement
            .query_map([], row_note)
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())
    }

    pub fn get(&self, id: &str) -> Result<Note> {
        self.connection()?.query_row("SELECT id, document, plain_text, color, pinned, created_at, updated_at FROM notes WHERE id=?1", [id], row_note).optional().map_err(|e| e.to_string())?.ok_or_else(|| "메모를 찾을 수 없습니다. 삭제되었을 수 있습니다.".into())
    }

    pub fn create(&self) -> Result<Note> {
        let note = Note {
            id: uuid::Uuid::new_v4().to_string(),
            document: json!({"type":"doc","content":[{"type":"paragraph"}]}),
            plain_text: String::new(),
            color: "yellow".into(),
            pinned: false,
            created_at: now(),
            updated_at: now(),
        };
        self.connection()?
            .execute(
                "INSERT INTO notes VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    note.id,
                    note.document.to_string(),
                    note.plain_text,
                    note.color,
                    note.pinned,
                    note.created_at,
                    note.updated_at
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(note)
    }

    pub fn save(&self, id: &str, document: Value, plain_text: &str) -> Result<Note> {
        if document.get("type").and_then(Value::as_str) != Some("doc") {
            return Err("메모 문서 형식이 올바르지 않습니다.".into());
        }
        let changed = self
            .connection()?
            .execute(
                "UPDATE notes SET document=?1, plain_text=?2, updated_at=?3 WHERE id=?4",
                params![document.to_string(), plain_text, now(), id],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("삭제된 메모는 저장할 수 없습니다.".into());
        }
        self.get(id)
    }

    pub fn set_color(&self, id: &str, color: &str) -> Result<Note> {
        if !COLORS.contains(&color) {
            return Err("지원하지 않는 메모 색상입니다.".into());
        }
        self.connection()?
            .execute("UPDATE notes SET color=?1 WHERE id=?2", params![color, id])
            .map_err(|e| e.to_string())?;
        self.get(id)
    }

    pub fn set_pinned(&self, id: &str, pinned: bool) -> Result<Note> {
        self.connection()?
            .execute(
                "UPDATE notes SET pinned=?1 WHERE id=?2",
                params![pinned, id],
            )
            .map_err(|e| e.to_string())?;
        self.get(id)
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let mut connection = self.connection()?;
        let tx = connection.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM windows WHERE label=?1", [format!("note-{id}")])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM notes WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn save_window(&self, state: &WindowState) -> Result<()> {
        if [state.x, state.y, state.width, state.height]
            .iter()
            .any(|v| !v.is_finite())
            || state.width <= 0.0
            || state.height <= 0.0
        {
            return Err("창 위치가 올바르지 않습니다.".into());
        }
        // A window event queued before deletion must not recreate its restore record.
        if let Some(id) = state.label.strip_prefix("note-") {
            self.get(id)?;
        }
        self.connection()?.execute("INSERT INTO windows VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(label) DO UPDATE SET x=excluded.x,y=excluded.y,width=excluded.width,height=excluded.height,is_open=excluded.is_open", params![state.label,state.x,state.y,state.width,state.height,state.is_open]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn windows(&self) -> Result<Vec<WindowState>> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare("SELECT label,x,y,width,height,is_open FROM windows")
            .map_err(|e| e.to_string())?;
        statement
            .query_map([], |r| {
                Ok(WindowState {
                    label: r.get(0)?,
                    x: r.get(1)?,
                    y: r.get(2)?,
                    width: r.get(3)?,
                    height: r.get(4)?,
                    is_open: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn create_save_and_reopen_preserves_formatted_content() {
        let path = std::env::temp_dir().join(format!("sticky-{}.sqlite", uuid::Uuid::new_v4()));
        let id;
        {
            let store = Store::open(&path).unwrap();
            assert!(store.list().unwrap().is_empty());
            let note = store.create().unwrap();
            id = note.id.clone();
            assert_eq!(note.color, "yellow");
            assert!(!note.pinned);
            let doc = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"한글 메모","marks":[{"type":"bold"}]}]}]});
            let saved = store.save(&id, doc.clone(), "한글 메모").unwrap();
            assert_eq!(saved.document, doc);
            store.set_color(&id, "purple").unwrap();
            store.set_pinned(&id, true).unwrap();
            store
                .save_window(&WindowState {
                    label: format!("note-{id}"),
                    x: 12.0,
                    y: 23.0,
                    width: 320.0,
                    height: 360.0,
                    is_open: true,
                })
                .unwrap();
        }
        let store = Store::open(&path).unwrap();
        let note = store.get(&id).unwrap();
        assert_eq!(note.plain_text, "한글 메모");
        assert_eq!(note.color, "purple");
        assert!(note.pinned);
        assert_eq!(store.windows().unwrap()[0].x, 12.0);
        drop(store);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn deletion_rejects_late_saves_and_removes_window_state() {
        let store = Store::memory().unwrap();
        let id = store.create().unwrap().id;
        store
            .save_window(&WindowState {
                label: format!("note-{id}"),
                x: 0.0,
                y: 0.0,
                width: 320.0,
                height: 360.0,
                is_open: true,
            })
            .unwrap();
        store.delete(&id).unwrap();
        assert!(
            store
                .save(&id, json!({"type":"doc","content":[]}), "late")
                .is_err()
        );
        assert!(store.get(&id).is_err());
        assert!(store.windows().unwrap().is_empty());
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn invalid_color_does_not_change_note() {
        let store = Store::memory().unwrap();
        let id = store.create().unwrap().id;
        assert!(store.set_color(&id, "invalid").is_err());
        assert_eq!(store.get(&id).unwrap().color, "yellow");
    }

    #[test]
    fn corrupt_database_is_not_replaced() {
        let path =
            std::env::temp_dir().join(format!("sticky-corrupt-{}.sqlite", uuid::Uuid::new_v4()));
        std::fs::write(&path, b"not a sqlite database").unwrap();
        assert!(Store::open(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"not a sqlite database");
        std::fs::remove_file(path).unwrap();
    }
}

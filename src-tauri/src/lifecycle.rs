use std::collections::HashSet;

#[derive(Debug, PartialEq)]
pub enum QuitDecision {
    Waiting,
    Ready,
    Cancelled,
    Ignored,
}

#[derive(Default)]
pub struct QuitCoordinator {
    pending: Option<(String, HashSet<String>)>,
}

impl QuitCoordinator {
    pub fn begin(&mut self, windows: Vec<String>) -> String {
        if let Some((token, _)) = &self.pending {
            return token.clone();
        }
        let token = uuid::Uuid::new_v4().to_string();
        self.pending = Some((token.clone(), windows.into_iter().collect()));
        token
    }
    pub fn cancel(&mut self) {
        self.pending = None;
    }
    pub fn active(&self) -> bool {
        self.pending.is_some()
    }
    pub fn ack(&mut self, token: &str, window: &str, success: bool) -> QuitDecision {
        let Some((current, pending)) = self.pending.as_mut() else {
            return QuitDecision::Ignored;
        };
        if current != token || !pending.contains(window) {
            return QuitDecision::Ignored;
        }
        if !success {
            self.pending = None;
            return QuitDecision::Cancelled;
        }
        pending.remove(window);
        if pending.is_empty() {
            self.pending = None;
            QuitDecision::Ready
        } else {
            QuitDecision::Waiting
        }
    }
    pub fn expire(&mut self, token: &str) -> bool {
        if self
            .pending
            .as_ref()
            .is_some_and(|(current, _)| current == token)
        {
            self.pending = None;
            true
        } else {
            false
        }
    }
}

#[derive(Clone, Copy)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn clamp_window(mut rect: Rect, monitors: &[Rect]) -> Rect {
    let Some(monitor) = monitors
        .iter()
        .find(|m| {
            rect.x < m.x + m.width
                && rect.x + rect.width > m.x
                && rect.y < m.y + m.height
                && rect.y + rect.height > m.y
        })
        .or(monitors.first())
    else {
        return rect;
    };
    rect.width = rect.width.min(monitor.width);
    rect.height = rect.height.min(monitor.height);
    rect.x = rect
        .x
        .max(monitor.x)
        .min(monitor.x + monitor.width - rect.width);
    rect.y = rect
        .y
        .max(monitor.y)
        .min(monitor.y + monitor.height - rect.height);
    rect
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quit_waits_for_every_editor_and_ignores_stale_acknowledgements() {
        let mut quit = QuitCoordinator::default();
        let token = quit.begin(vec!["note-a".into(), "note-b".into()]);
        assert_eq!(quit.ack("old-token", "note-a", true), QuitDecision::Ignored);
        assert_eq!(quit.ack(&token, "note-a", true), QuitDecision::Waiting);
        assert_eq!(quit.ack(&token, "note-b", true), QuitDecision::Ready);
    }
    #[test]
    fn failed_save_cancels_quit() {
        let mut quit = QuitCoordinator::default();
        let token = quit.begin(vec!["note-a".into()]);
        assert_eq!(quit.ack(&token, "note-a", false), QuitDecision::Cancelled);
        assert_eq!(quit.ack(&token, "note-a", true), QuitDecision::Ignored);
    }
    #[test]
    fn offscreen_window_is_clamped_inside_current_monitor() {
        let bounds = Rect {
            x: 5000.0,
            y: 3000.0,
            width: 320.0,
            height: 360.0,
        };
        let monitor = Rect {
            x: 0.0,
            y: 24.0,
            width: 1440.0,
            height: 876.0,
        };
        let result = clamp_window(bounds, &[monitor]);
        assert!(result.x >= 0.0 && result.x + result.width <= 1440.0);
        assert!(result.y >= 24.0 && result.y + result.height <= 900.0);
    }
}

use tauri::{AppHandle, Manager};

// Pastille d'alerte sur l'icône de l'app dans la barre des tâches Windows (overlay icon),
// posée quand une affaire est « à commander » sans être cochée « OK pour être commandée »
// (décision 2026-09-30, cf. domain/caissesACommander.ts). Dessinée ici (disque rouge + « ! »
// blanc) plutôt que chargée depuis un fichier : pas de ressource ni de feature d'image à ajouter.

const TAILLE: u32 = 32;

fn pastille_rgba() -> Vec<u8> {
    let mut rgba = vec![0u8; (TAILLE * TAILLE * 4) as usize];
    let centre = (TAILLE as f32 - 1.0) / 2.0;
    let rayon = TAILLE as f32 / 2.0;
    for y in 0..TAILLE {
        for x in 0..TAILLE {
            let (dx, dy) = (x as f32 - centre, y as f32 - centre);
            let distance = (dx * dx + dy * dy).sqrt();
            // Bord adouci sur 1 px.
            let alpha = ((rayon - distance).clamp(0.0, 1.0) * 255.0) as u8;
            if alpha == 0 {
                continue;
            }
            // « ! » blanc : barre verticale (y 7..20) et point (y 23..26), 4 px de large.
            let dans_barre = dx.abs() <= 2.0 && (7..=20).contains(&y);
            let dans_point = dx.abs() <= 2.0 && (23..=26).contains(&y);
            let (r, g, b) = if dans_barre || dans_point { (255, 255, 255) } else { (220, 38, 38) };
            let i = ((y * TAILLE + x) * 4) as usize;
            rgba[i..i + 4].copy_from_slice(&[r, g, b, alpha]);
        }
    }
    rgba
}

#[tauri::command]
pub fn set_alerte_barre_taches(app: AppHandle, active: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let Some(fenetre) = app.get_webview_window("main") else {
            return Ok(());
        };
        let icone = active.then(|| tauri::image::Image::new_owned(pastille_rgba(), TAILLE, TAILLE));
        fenetre.set_overlay_icon(icone).map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    let _ = (app, active, pastille_rgba);
    Ok(())
}

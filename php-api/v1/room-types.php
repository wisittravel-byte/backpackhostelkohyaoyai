<?php
require_once __DIR__ . '/../common.php';

// Inputs: optional is_private filter (0/1), pagination optional in future
$isPrivate = isset($_GET['is_private']) ? (int)$_GET['is_private'] : null;

// Base room types
$where = ' WHERE 1=1 AND rt.is_active=1 ';
$params=[]; if($isPrivate!==null){ $where.=' AND COALESCE(rt.is_private,0)=:p'; $params[':p']=$isPrivate; }
$sql = "SELECT rt.id, COALESCE(rt.is_private,0) AS is_private, rt.code, rt.name_th, rt.name_en, rt.area_sqm, rt.base_inventory, rt.max_adults, rt.max_children, rt.is_active, rt.image_dir_path FROM room_types rt $where ORDER BY rt.id ASC";
$st=$pdo->prepare($sql); $st->execute($params); $rows=$st->fetchAll(PDO::FETCH_ASSOC)?:[];

// Attach images (cover-first) and computed cover
foreach($rows as &$r){
	$rtid = (int)$r['id'];
	$imageDir = isset($r['image_dir_path']) ? rtrim((string)$r['image_dir_path'], '/') : '';
	try{
		$q = $pdo->prepare('SELECT id, file_name, is_cover, width_px, height_px, mime_type, file_size_kb, created_at FROM room_type_images WHERE room_type_id=:id ORDER BY is_cover DESC, sort_order ASC, id ASC');
		$q->execute([':id'=>$rtid]);
		$imgs = $q->fetchAll(PDO::FETCH_ASSOC) ?: [];
		$out = [];
		foreach($imgs as $im){
			$fn = $im['file_name'] ?? '';
			if(!$fn) continue;
			$rel = ltrim(($imageDir ? ($imageDir.'/') : '').$fn, '/');
			$out[] = [
				'id'=>(int)$im['id'],
				'file_name'=>$fn,
				'relative_path'=>$rel,
				'url'=> $rel ? toPublicUrl_common($rel) : null,
				'is_cover'=> (bool)($im['is_cover'] ?? false),
				'width_px'=> isset($im['width_px'])? (int)$im['width_px']:null,
				'height_px'=> isset($im['height_px'])? (int)$im['height_px']:null,
				'mime_type'=> $im['mime_type'] ?? null,
				'file_size_kb'=> isset($im['file_size_kb'])? (float)$im['file_size_kb']:null,
				'created_at'=> $im['created_at'] ?? null,
			];
		}
		$r['images'] = $out;
		// cover: first item (already sorted with cover first)
		$cov = isset($out[0]) ? $out[0] : null;
		$r['cover'] = $cov ? [
			'url' => $cov['url'],
			'width_px' => $cov['width_px'],
			'height_px' => $cov['height_px'],
			'mime_type' => $cov['mime_type']
		] : null;
	}catch(Throwable $e){ $r['images']=[]; $r['cover']=null; }
}
unset($r);

json_out(['items'=>$rows]);

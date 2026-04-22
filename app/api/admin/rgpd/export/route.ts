import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const residentId = searchParams.get('residentId');
  if (!residentId) {
    return NextResponse.json({ error: 'residentId requis' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Récupère toutes les données liées au résident
  const [
    { data: resident },
    { data: consignes },
    { data: pap },
    { data: papVersions },
    { data: poids },
    { data: vaccination },
    { data: contentions },
    { data: niveauSoin },
    { data: prisesEnCharge },
    { data: bilanSpecial },
    { data: planningBilan },
    { data: dossierNutritionnel },
    { data: complementAlimentaire },
    { data: suiviClinique },
    { data: suiviAntalgique },
  ] = await Promise.all([
    admin.from('residents').select('*').eq('id', residentId).maybeSingle(),
    admin.from('consigne_nuit').select('*').eq('resident_id', residentId),
    admin.from('pap').select('*').eq('resident_id', residentId),
    admin.from('pap_version').select('*').eq('resident_id', residentId),
    admin.from('poids_mesure').select('*').eq('resident_id', residentId),
    admin.from('vaccination').select('*').eq('resident_id', residentId),
    admin.from('contentions').select('*').eq('resident_id', residentId),
    admin.from('niveau_soin').select('*').eq('resident_id', residentId),
    admin.from('prise_en_charge').select('*').eq('resident_id', residentId),
    admin.from('bilan_special').select('*').eq('resident_id', residentId),
    admin.from('planning_bilan_cell').select('*').eq('resident_id', residentId),
    admin.from('dossier_nutritionnel').select('*').eq('resident_id', residentId),
    admin.from('complement_alimentaire').select('*').eq('resident_id', residentId),
    admin.from('suivi_clinique_nutritionnel').select('*').eq('resident_id', residentId),
    admin.from('suivi_antalgique').select('*').eq('resident_id', residentId),
  ]);

  // Audit
  const { data: { user } } = await admin.auth.admin.listUsers({ perPage: 1 });
  await admin.from('audit_logs').insert({
    action: 'rgpd_export',
    resource: 'residents',
    details: { resident_id: residentId, resident_name: resident ? `${resident.last_name} ${resident.first_name ?? ''}`.trim() : residentId },
  });

  const exportData = {
    export_date: new Date().toISOString(),
    export_type: 'RGPD - Droit d\'accès (Article 15 RGPD)',
    etablissement: 'Résidence La Fourrier',
    resident,
    donnees_medicales: {
      consignes_nuit: consignes ?? [],
      pap: pap ?? [],
      pap_versions: papVersions ?? [],
      poids: poids ?? [],
      vaccination: vaccination ?? [],
      contentions: contentions ?? [],
      niveau_soin: niveauSoin ?? [],
      prises_en_charge: prisesEnCharge ?? [],
      bilans: bilanSpecial ?? [],
      planning_bilans: planningBilan ?? [],
      dossier_nutritionnel: dossierNutritionnel ?? [],
      complement_alimentaire: complementAlimentaire ?? [],
      suivi_clinique_nutritionnel: suiviClinique ?? [],
      suivi_antalgique: suiviAntalgique ?? [],
    },
  };

  const filename = `RGPD_export_${resident?.last_name ?? residentId}_${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

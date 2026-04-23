"""
Script de migració per afegir les columnes noves a la taula contratos
i crear les noves taules (criteris_adjudicacio, membres_mesa, documents_fase).

Executa: python scripts/migrate_enrichment.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.database import engine, Base
from sqlalchemy import text, inspect
import models  # Importem tots els models per registrar-los

def run_migration():
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    existing_columns = {}
    
    if 'contratos' in existing_tables:
        existing_columns = {c['name'] for c in inspector.get_columns('contratos')}
    
    # Noves columnes per a la taula contratos
    new_columns = {
        'normativa_aplicable': 'VARCHAR(255)',
        'tipus_publicacio_expedient': 'VARCHAR(100)',
        'procediment_adjudicacio': 'VARCHAR(255)',
        'acces_exclusiu': 'BOOLEAN',
        'tipus_oferta_electronica': 'VARCHAR(100)',
        'compra_publica_innovacio': 'BOOLEAN',
        'contracte_mixt': 'BOOLEAN',
        'te_lots': 'BOOLEAN',
        'contracte_harmonitzat': 'BOOLEAN',
        'data_termini_presentacio': 'TIMESTAMP',
        'preveuen_modificacions': 'BOOLEAN',
        'preveuen_prorrogues': 'BOOLEAN',
        'causa_habilitant': 'TEXT',
        'divisio_lots': 'VARCHAR(100)',
        'garantia_provisional': 'BOOLEAN',
        'garantia_definitiva': 'BOOLEAN',
        'percentatge_garantia_definitiva': 'NUMERIC(5, 2)',
        'reserva_social': 'BOOLEAN',
        'import_adjudicacio_sense_iva': 'NUMERIC(15, 2)',
        'iva_percentatge': 'NUMERIC(5, 2)',
        'valor_estimat_contracte': 'NUMERIC(15, 2)',
        'revisio_preus': 'VARCHAR(255)',
        'total_ofertes_rebudes': 'INTEGER',
        'durada_anys': 'INTEGER',
        'durada_mesos': 'INTEGER',
        'durada_dies': 'INTEGER',
        'data_inici_execucio': 'DATE',
        'data_fi_execucio': 'DATE',
        'adjudicatari_tipus_empresa': 'VARCHAR(100)',
        'adjudicatari_tercer_sector': 'VARCHAR(100)',
        'adjudicatari_telefon': 'VARCHAR(50)',
        'adjudicatari_email': 'VARCHAR(255)',
        'subcontractacio_permesa': 'BOOLEAN',
        'peu_recurs': 'TEXT',
        'fecha_enriquiment': 'TIMESTAMP',
    }
    
    with engine.begin() as conn:
        # 1. Afegir columnes noves a contratos
        added = 0
        for col_name, col_type in new_columns.items():
            if col_name not in existing_columns:
                try:
                    conn.execute(text(f'ALTER TABLE contratos ADD COLUMN {col_name} {col_type}'))
                    print(f'  ✅ Afegida columna: contratos.{col_name} ({col_type})')
                    added += 1
                except Exception as e:
                    print(f'  ⚠️ Error afegint {col_name}: {e}')
            else:
                pass  # Ja existeix
        
        if added == 0:
            print('  ℹ️ Totes les columnes ja existeixen a contratos')
        else:
            print(f'  📊 {added} columnes afegides a contratos')
    
    # 2. Crear noves taules (si no existeixen)
    new_tables = ['criteris_adjudicacio', 'membres_mesa', 'documents_fase']
    for table_name in new_tables:
        if table_name not in existing_tables:
            Base.metadata.tables[table_name].create(engine)
            print(f'  ✅ Creada taula: {table_name}')
        else:
            print(f'  ℹ️ Taula {table_name} ja existeix')
    
    print('\n✅ Migració completada!')


if __name__ == '__main__':
    print('🔄 Executant migració d\'enriquiment...\n')
    run_migration()

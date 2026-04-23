"""
Servei d'autenticació v2 — Seguretat per disseny.
- Cap secret hardcoded (tot de core.config.settings)
- Argon2id per hashing
- Refresh tokens amb rotació
- LDAP opcional
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer

from core.config import settings
from core.security import (
    verify_password, hash_password, create_access_token,
    create_refresh_token, hash_refresh_token, decode_access_token,
)
from core.database import get_db
import models

# Re-export constants per compatibilitat amb codi existent
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


class AuthService:
    """Servei d'autenticació amb suport per local + LDAP."""

    @staticmethod
    def verify_password(plain_password, hashed_password):
        return verify_password(plain_password, hashed_password)

    @staticmethod
    def get_password_hash(password):
        return hash_password(password)

    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
        return create_access_token(data, expires_delta)

    @staticmethod
    def ldap_authenticate(db: Session, username: str, password: str) -> Optional[models.Empleado]:
        """Autenticació LDAP (opcional). Llegeix configuració de la BDD."""
        from ldap3 import Server, Connection, ALL
        from ldap3.core.exceptions import LDAPException

        # Llegir config LDAP de la BDD
        configs = db.query(models.Configuracion).filter(
            models.Configuracion.clave.like("ldap_%")
        ).all()
        ldap_config = {c.clave: c.valor for c in configs}

        if ldap_config.get("ldap_enabled") != "true":
            return None

        server_uri = ldap_config.get("ldap_server")
        if not server_uri:
            return None

        port = int(ldap_config.get("ldap_port", 389))
        base_dn = ldap_config.get("ldap_base_dn")
        user_domain = ldap_config.get("ldap_user_domain", "")

        # Format user for bind
        bind_user = username
        if user_domain and not username.endswith(user_domain):
            bind_user = f"{username}{user_domain}"

        try:
            server = Server(server_uri, port=port, get_info=ALL)
            conn = Connection(server, user=bind_user, password=password, auto_bind=True)

            # Cercar detalls de l'usuari
            search_filter = f"(&(objectClass=user)(sAMAccountName={username.split('@')[0]}))"
            conn.search(base_dn, search_filter, attributes=['displayName', 'mail', 'memberOf'])

            if not conn.entries:
                return None

            entry = conn.entries[0]
            email = entry.mail.value if hasattr(entry, 'mail') and entry.mail.value else username
            if user_domain and "@" not in email:
                email = f"{email}{user_domain}"

            # Sync amb BDD local
            user = db.query(models.Empleado).filter(models.Empleado.email == email).first()

            # Mapeig de grups AD a rols
            new_rol = None
            new_dept_id = None

            group_mappings_json = ldap_config.get("ldap_group_mappings")
            if group_mappings_json and hasattr(entry, 'memberOf'):
                import json
                try:
                    mappings = json.loads(group_mappings_json)
                    user_groups = (
                        entry.memberOf.values
                        if isinstance(entry.memberOf.values, list)
                        else [entry.memberOf.value]
                    )
                    for mapping in mappings:
                        ad_group = mapping.get("ad_group")
                        if any(ad_group.lower() in ug.lower() for ug in user_groups):
                            if mapping.get("role"):
                                new_rol = mapping.get("role")
                            if mapping.get("dept_id"):
                                new_dept_id = mapping.get("dept_id")
                            if new_rol == "admin":
                                break
                except Exception as me:
                    import logging
                    logging.getLogger(__name__).error(f"LDAP mapping error: {str(me)}")

            if not user:
                user = models.Empleado(
                    nombre=entry.displayName.value if hasattr(entry, 'displayName') else username,
                    email=email,
                    activo=True,
                    rol=new_rol or "empleado",
                )
                if new_dept_id:
                    dept = db.query(models.Departamento).filter(models.Departamento.id == new_dept_id).first()
                    if dept:
                        user.departamentos = [dept]
                
                db.add(user)
                db.commit()
                db.refresh(user)
            else:
                if hasattr(entry, 'displayName') and entry.displayName.value:
                    user.nombre = entry.displayName.value
                if new_rol:
                    user.rol = new_rol
                if new_dept_id:
                    dept = db.query(models.Departamento).filter(models.Departamento.id == new_dept_id).first()
                    if dept:
                        # Prevent duplicate
                        if dept.id not in [d.id for d in user.departamentos]:
                            user.departamentos.clear()
                            user.departamentos.append(dept)
                user.activo = True
                db.commit()
                db.refresh(user)

            return user

        except LDAPException as e:
            import logging
            logging.getLogger(__name__).error(f"LDAP Error: {str(e)}")
            return None
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Auth Error: {str(e)}")
            return None


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    query_token: Optional[str] = Query(None, alias="token"),
    db: Session = Depends(get_db),
):
    """Extreu l'usuari del JWT. Rol es llegeix de BDD, no del token."""
    actual_token = token if token else query_token

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No s'han pogut validar les credencials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not actual_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(actual_token)
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception

    user = db.query(models.Empleado).filter(models.Empleado.email == email).first()
    if user is None:
        raise credentials_exception
    if not user.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuari inactiu")
    return user


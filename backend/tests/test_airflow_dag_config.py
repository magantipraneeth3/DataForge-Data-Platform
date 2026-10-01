import importlib.util
import sys
import types
from pathlib import Path


def _load_dag_module():
    class DummyDAG:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class DummyPythonOperator:
        def __init__(self, *args, **kwargs):
            pass

        def __rshift__(self, other):
            return other

    airflow_module = types.ModuleType("airflow")
    airflow_module.DAG = DummyDAG

    python_module = types.ModuleType("airflow.operators.python")
    python_module.PythonOperator = DummyPythonOperator

    sys.modules.setdefault("airflow", airflow_module)
    sys.modules.setdefault("airflow.operators", types.ModuleType("airflow.operators"))
    sys.modules["airflow.operators.python"] = python_module

    dag_path = Path(__file__).resolve().parents[2] / "airflow" / "dags" / "dataforge_etl_pipeline.py"
    spec = importlib.util.spec_from_file_location("dataforge_etl_pipeline", dag_path)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_airflow_dag_uses_project_root_and_dataforge_db_defaults():
    dag_module = _load_dag_module()

    assert dag_module.PROJECT_ROOT.exists()
    assert dag_module.DATASET_PATH.exists()
    assert "dataforge_user" in dag_module.DATABASE_URL
    assert "dataforge_password" in dag_module.DATABASE_URL
    assert "5434" in dag_module.DATABASE_URL
    assert "dataforge" in dag_module.DATABASE_URL

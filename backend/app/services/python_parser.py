"""
Real Python AST Parser
Inspired by Arcforge's parser.js but using Python's native AST for accuracy.
Extracts classes, functions, imports, inheritance, decorators, and more.
"""
import ast
import os
import re
from typing import Dict, List, Any, Set, Tuple, Optional
from dataclasses import dataclass, field
from collections import defaultdict


@dataclass
class ModelFieldRef:
    """A reference from a model field to another model (FK, M2M, OneToOne)."""
    field_name: str
    field_type: str  # 'ForeignKey' | 'ManyToManyField' | 'OneToOneField'
    target: str  # The referenced model name (e.g. 'User' or 'auth.User')


@dataclass
class ParsedClass:
    name: str
    bases: List[str] = field(default_factory=list)
    methods: List[str] = field(default_factory=list)
    decorators: List[str] = field(default_factory=list)
    docstring: Optional[str] = None
    line_number: int = 0
    is_model: bool = False
    is_view: bool = False
    is_serializer: bool = False
    is_viewset: bool = False
    is_admin: bool = False
    # Django-specific metadata
    model_refs: List[ModelFieldRef] = field(default_factory=list)  # FK/M2M relations
    admin_target_model: Optional[str] = None  # For ModelAdmin: which model is it for
    serializer_model: Optional[str] = None  # For ModelSerializer: the Meta.model


@dataclass
class ParsedFunction:
    name: str
    args: List[str] = field(default_factory=list)
    decorators: List[str] = field(default_factory=list)
    docstring: Optional[str] = None
    line_number: int = 0
    is_route: bool = False
    is_async: bool = False
    complexity: int = 1


@dataclass
class ParsedImport:
    module: str
    names: List[str] = field(default_factory=list)
    is_relative: bool = False
    alias: Optional[str] = None


@dataclass
class ParsedFile:
    path: str
    classes: List[ParsedClass] = field(default_factory=list)
    functions: List[ParsedFunction] = field(default_factory=list)
    imports: List[ParsedImport] = field(default_factory=list)
    line_count: int = 0
    complexity: int = 0
    file_type: str = 'module'  # models, views, urls, etc.
    framework_role: Optional[str] = None
    # Django-specific project metadata
    url_view_refs: List[str] = field(default_factory=list)  # Names referenced in urlpatterns
    admin_registrations: List[str] = field(default_factory=list)  # admin.site.register(Model)
    installed_apps: List[str] = field(default_factory=list)  # From settings.INSTALLED_APPS
    app_name: Optional[str] = None  # From apps.py AppConfig.name


class PythonParser:
    """
    AST-based Python parser that extracts real architectural information.
    """
    
    # Framework-specific base classes
    DJANGO_MODEL_BASES = {'Model', 'models.Model', 'AbstractUser', 'AbstractBaseUser'}
    DJANGO_VIEW_BASES = {'View', 'TemplateView', 'ListView', 'DetailView', 'CreateView', 
                          'UpdateView', 'DeleteView', 'FormView', 'RedirectView'}
    DRF_VIEW_BASES = {'APIView', 'GenericAPIView', 'ViewSet', 'ModelViewSet', 
                       'ReadOnlyModelViewSet', 'GenericViewSet'}
    DRF_SERIALIZER_BASES = {'Serializer', 'ModelSerializer', 'HyperlinkedModelSerializer'}
    DJANGO_ADMIN_BASES = {'ModelAdmin', 'admin.ModelAdmin', 'StackedInline', 'TabularInline'}
    
    # Route decorators
    ROUTE_DECORATORS = {'route', 'get', 'post', 'put', 'delete', 'patch', 'head', 'options',
                        'app.route', 'app.get', 'app.post', 'app.put', 'app.delete',
                        'router.get', 'router.post', 'router.put', 'router.delete',
                        'api_view', 'action'}
    
    def parse_file(self, filepath: str, content: str) -> ParsedFile:
        """Parse a single Python file and extract its structure."""
        result = ParsedFile(path=filepath)
        
        try:
            tree = ast.parse(content)
        except SyntaxError:
            return result
        
        result.line_count = len(content.split('\n'))
        result.file_type = self._detect_file_type(filepath)
        
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                cls = self._parse_class(node)
                result.classes.append(cls)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                # Only top-level functions, not methods
                if self._is_top_level(node, tree):
                    fn = self._parse_function(node)
                    fn.is_async = isinstance(node, ast.AsyncFunctionDef)
                    result.functions.append(fn)
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                imp = self._parse_import(node)
                if imp:
                    result.imports.append(imp)
        
        # File-type-specific extraction on the full tree
        if result.file_type == 'urls':
            result.url_view_refs = self._extract_url_view_refs(tree)
        elif result.file_type == 'admin':
            result.admin_registrations = self._extract_admin_registrations(tree)
        elif result.file_type == 'settings':
            result.installed_apps = self._extract_installed_apps(tree)
        elif result.file_type == 'apps':
            result.app_name = self._extract_app_name(tree)
        
        # Calculate overall complexity
        result.complexity = sum(f.complexity for f in result.functions)
        result.complexity += sum(len(c.methods) for c in result.classes)
        
        return result
    
    def _extract_url_view_refs(self, tree: ast.AST) -> List[str]:
        """
        Extract view names referenced in Django/DRF urlpatterns.
        Looks for: path('x/', views.MyView.as_view()), path('y/', my_func_view)
        """
        refs: Set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = self._get_name(node.func)
                # path(), re_path(), url()
                if func_name in ('path', 're_path', 'url'):
                    # Second positional arg is the view
                    if len(node.args) >= 2:
                        view_arg = node.args[1]
                        name = self._get_name(view_arg)
                        if name:
                            # Strip .as_view() suffix
                            clean = name.replace('.as_view', '').split('(')[0]
                            # Take last segment (e.g., views.MyView → MyView)
                            refs.add(clean.split('.')[-1])
        return sorted(refs)
    
    def _extract_admin_registrations(self, tree: ast.AST) -> List[str]:
        """
        Extract models registered in admin.py.
        Looks for: admin.site.register(ModelName) or @admin.register(ModelName)
        """
        registrations: Set[str] = set()
        for node in ast.walk(tree):
            # admin.site.register(Model) or admin.site.register(Model, CustomAdmin)
            if isinstance(node, ast.Call):
                func_name = self._get_name(node.func)
                if 'register' in func_name.lower():
                    for arg in node.args:
                        name = self._get_name(arg)
                        if name and name[0].isupper():  # Class names start uppercase
                            registrations.add(name.split('.')[-1])
            # @admin.register(Model, Model2)
            if isinstance(node, ast.ClassDef):
                for dec in node.decorator_list:
                    if isinstance(dec, ast.Call):
                        dec_name = self._get_name(dec.func)
                        if 'register' in dec_name.lower():
                            for arg in dec.args:
                                name = self._get_name(arg)
                                if name and name[0].isupper():
                                    registrations.add(name.split('.')[-1])
        return sorted(registrations)
    
    def _extract_installed_apps(self, tree: ast.AST) -> List[str]:
        """
        Extract INSTALLED_APPS list from settings.py.
        Only returns local apps (not django.contrib.* or third-party).
        """
        apps: List[str] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == 'INSTALLED_APPS':
                        if isinstance(node.value, (ast.List, ast.Tuple)):
                            for item in node.value.elts:
                                if isinstance(item, ast.Constant) and isinstance(item.value, str):
                                    apps.append(item.value)
        return apps
    
    def _extract_app_name(self, tree: ast.AST) -> Optional[str]:
        """Extract app name from apps.py AppConfig.name attribute."""
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                for item in node.body:
                    if isinstance(item, ast.Assign):
                        for target in item.targets:
                            if isinstance(target, ast.Name) and target.id == 'name':
                                if isinstance(item.value, ast.Constant) and isinstance(item.value.value, str):
                                    return item.value.value
        return None
    
    def _parse_class(self, node: ast.ClassDef) -> ParsedClass:
        """Parse a class definition."""
        cls = ParsedClass(
            name=node.name,
            line_number=node.lineno,
            docstring=ast.get_docstring(node)
        )
        
        # Extract base classes
        for base in node.bases:
            base_name = self._get_name(base)
            if base_name:
                cls.bases.append(base_name)
        
        # Extract decorators
        for dec in node.decorator_list:
            dec_name = self._get_name(dec)
            if dec_name:
                cls.decorators.append(dec_name)
        
        # Extract methods
        for item in node.body:
            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                cls.methods.append(item.name)
        
        # Detect role from bases
        base_set = set(cls.bases)
        base_text = ' '.join(cls.bases)
        if base_set & self.DJANGO_MODEL_BASES or 'Model' in base_text:
            cls.is_model = True
        if base_set & (self.DJANGO_VIEW_BASES | self.DRF_VIEW_BASES):
            cls.is_view = True
            if 'ViewSet' in base_text:
                cls.is_viewset = True
        if base_set & self.DRF_SERIALIZER_BASES or 'Serializer' in base_text:
            cls.is_serializer = True
        if base_set & self.DJANGO_ADMIN_BASES or 'ModelAdmin' in base_text:
            cls.is_admin = True
        
        # Extract Django model field references (FK, M2M, OneToOne)
        if cls.is_model:
            cls.model_refs = self._extract_model_field_refs(node)
        
        # Extract admin target model from decorator: @admin.register(Model)
        if cls.is_admin:
            for dec in node.decorator_list:
                if isinstance(dec, ast.Call):
                    dec_name = self._get_name(dec.func)
                    if 'register' in dec_name.lower() and dec.args:
                        target = self._get_name(dec.args[0])
                        if target:
                            cls.admin_target_model = target.split('.')[-1]
                            break
        
        # Extract serializer/admin target from inner Meta class: class Meta: model = MyModel
        if cls.is_serializer or cls.is_admin:
            for item in node.body:
                if isinstance(item, ast.ClassDef) and item.name == 'Meta':
                    for meta_item in item.body:
                        if isinstance(meta_item, ast.Assign):
                            for tgt in meta_item.targets:
                                if isinstance(tgt, ast.Name) and tgt.id == 'model':
                                    model_ref = self._get_name(meta_item.value)
                                    if model_ref:
                                        model_name = model_ref.split('.')[-1]
                                        if cls.is_serializer:
                                            cls.serializer_model = model_name
                                        elif cls.is_admin and not cls.admin_target_model:
                                            cls.admin_target_model = model_name
        
        return cls
    
    def _extract_model_field_refs(self, class_node: ast.ClassDef) -> List[ModelFieldRef]:
        """
        Extract ForeignKey / ManyToManyField / OneToOneField references from a Django model.
        
        Handles: author = models.ForeignKey(User, on_delete=models.CASCADE)
                 tags = models.ManyToManyField('Tag')
                 profile = models.OneToOneField(settings.AUTH_USER_MODEL, ...)
        """
        refs: List[ModelFieldRef] = []
        rel_fields = {'ForeignKey', 'ManyToManyField', 'OneToOneField'}
        
        for item in class_node.body:
            if isinstance(item, ast.Assign) and len(item.targets) == 1:
                target = item.targets[0]
                if not isinstance(target, ast.Name):
                    continue
                field_name = target.id
                
                # Value must be a call like models.ForeignKey(...)
                if not isinstance(item.value, ast.Call):
                    continue
                
                call_name = self._get_name(item.value.func)
                field_type = call_name.split('.')[-1]
                if field_type not in rel_fields:
                    continue
                
                # First positional arg is the target model
                if item.value.args:
                    first_arg = item.value.args[0]
                    target_name: Optional[str] = None
                    
                    # Case 1: String reference 'App.Model' or 'self'
                    if isinstance(first_arg, ast.Constant) and isinstance(first_arg.value, str):
                        target_name = first_arg.value
                    # Case 2: Identifier (User)
                    elif isinstance(first_arg, ast.Name):
                        target_name = first_arg.id
                    # Case 3: Attribute (app.User or settings.AUTH_USER_MODEL)
                    elif isinstance(first_arg, ast.Attribute):
                        full = self._get_name(first_arg)
                        if full == 'settings.AUTH_USER_MODEL':
                            target_name = 'User'  # Conventional mapping
                        else:
                            target_name = full.split('.')[-1]
                    
                    if target_name:
                        refs.append(ModelFieldRef(
                            field_name=field_name,
                            field_type=field_type,
                            target=target_name,
                        ))
        
        return refs
    
    def _parse_function(self, node) -> ParsedFunction:
        """Parse a function definition."""
        fn = ParsedFunction(
            name=node.name,
            line_number=node.lineno,
            docstring=ast.get_docstring(node),
            args=[arg.arg for arg in node.args.args]
        )
        
        # Extract decorators
        for dec in node.decorator_list:
            dec_name = self._get_name(dec)
            if dec_name:
                fn.decorators.append(dec_name)
                # Check if it's a route
                if any(route in dec_name for route in self.ROUTE_DECORATORS):
                    fn.is_route = True
        
        # Calculate cyclomatic complexity
        fn.complexity = self._calculate_complexity(node)
        
        return fn
    
    def _parse_import(self, node) -> Optional[ParsedImport]:
        """Parse an import statement."""
        if isinstance(node, ast.Import):
            if node.names:
                first = node.names[0]
                return ParsedImport(
                    module=first.name,
                    names=[n.name for n in node.names],
                    alias=first.asname
                )
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ''
            is_relative = node.level > 0
            if is_relative:
                module = '.' * node.level + module
            return ParsedImport(
                module=module,
                names=[n.name for n in node.names] if node.names else [],
                is_relative=is_relative
            )
        return None
    
    def _get_name(self, node) -> str:
        """Extract name from various AST node types."""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            parent = self._get_name(node.value)
            return f"{parent}.{node.attr}" if parent else node.attr
        elif isinstance(node, ast.Call):
            return self._get_name(node.func)
        elif isinstance(node, ast.Subscript):
            return self._get_name(node.value)
        return ''
    
    def _is_top_level(self, func_node, tree) -> bool:
        """Check if a function is at module level (not inside a class)."""
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                for item in node.body:
                    if item is func_node:
                        return False
        return True
    
    def _calculate_complexity(self, node) -> int:
        """Calculate cyclomatic complexity of a function."""
        complexity = 1
        for child in ast.walk(node):
            if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor,
                                    ast.ExceptHandler, ast.With, ast.AsyncWith,
                                    ast.Assert, ast.BoolOp)):
                complexity += 1
            elif isinstance(child, ast.comprehension):
                complexity += 1
        return complexity
    
    def _detect_file_type(self, filepath: str) -> str:
        """Detect the type of Python file based on its name/path."""
        filename = os.path.basename(filepath).lower()
        path_lower = filepath.lower().replace('\\', '/')
        
        # Path-based detection (takes precedence for folders)
        if '/migrations/' in path_lower and filename != '__init__.py':
            return 'migration'
        if '/management/commands/' in path_lower:
            return 'command'
        if '/templatetags/' in path_lower:
            return 'templatetag'
        
        type_map = {
            'models.py': 'models',
            'views.py': 'views',
            'urls.py': 'urls',
            'serializers.py': 'serializers',
            'admin.py': 'admin',
            'forms.py': 'forms',
            'tests.py': 'tests',
            'settings.py': 'settings',
            'middleware.py': 'middleware',
            'signals.py': 'signals',
            'apps.py': 'apps',
            'tasks.py': 'tasks',
            'utils.py': 'utils',
            'exceptions.py': 'exceptions',
            'permissions.py': 'permissions',
            'validators.py': 'validators',
            'managers.py': 'managers',
            'main.py': 'entry',
            'app.py': 'entry',
            'wsgi.py': 'entry',
            'asgi.py': 'entry',
            'manage.py': 'entry',
            '__init__.py': 'package',
        }
        
        return type_map.get(filename, 'module')


class ProjectGraphBuilder:
    """
    Builds a complete architecture graph from parsed Python files.
    This is the core of the architecture visualization.
    """
    
    def __init__(self):
        self.parser = PythonParser()
        self.parsed_files: Dict[str, ParsedFile] = {}
        self.class_registry: Dict[str, str] = {}  # class_name -> filepath
        self.function_registry: Dict[str, str] = {}  # func_name -> filepath
    
    def build_graph(self, files: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Build a complete graph from project files.
        
        Args:
            files: List of {path, content} dicts
            
        Returns:
            {nodes, edges, metrics, insights}
        """
        # Phase 1: Parse all files
        for file_data in files:
            path = file_data.get('path', '')
            content = file_data.get('content', '')
            if path.endswith('.py') and content:
                parsed = self.parser.parse_file(path, content)
                self.parsed_files[path] = parsed
                
                # Register classes and functions for cross-reference
                for cls in parsed.classes:
                    self.class_registry[cls.name] = path
                for fn in parsed.functions:
                    self.function_registry[fn.name] = path
        
        # Phase 2: Build nodes
        nodes = self._build_nodes()
        
        # Phase 3: Build edges (imports, inheritance, calls)
        edges = self._build_edges()
        
        # Phase 4: Calculate metrics
        metrics = self._calculate_metrics()
        
        # Phase 5: Generate insights
        insights = self._generate_insights()
        
        return {
            'nodes': nodes,
            'edges': edges,
            'metrics': metrics,
            'insights': insights,
        }
    
    def _build_nodes(self) -> List[Dict[str, Any]]:
        """Build nodes from parsed files."""
        nodes = []
        
        for path, parsed in self.parsed_files.items():
            # Create a node for each class (most important)
            for cls in parsed.classes:
                node_type = self._determine_class_node_type(cls)
                nodes.append({
                    'id': f"class:{path}:{cls.name}",
                    'type': node_type,
                    'data': {
                        'label': cls.name,
                        'filepath': path,
                        'line': cls.line_number,
                        'description': cls.docstring[:100] if cls.docstring else None,
                        'bases': cls.bases,
                        'methods': cls.methods[:5],
                        'methodCount': len(cls.methods),
                        'complexity': len(cls.methods),
                        'category': self._get_class_category(cls),
                    }
                })
            
            # Create nodes for route functions (API endpoints)
            for fn in parsed.functions:
                if fn.is_route:
                    nodes.append({
                        'id': f"func:{path}:{fn.name}",
                        'type': 'route',
                        'data': {
                            'label': fn.name,
                            'filepath': path,
                            'line': fn.line_number,
                            'description': fn.docstring[:100] if fn.docstring else None,
                            'decorators': fn.decorators,
                            'complexity': fn.complexity,
                            'isAsync': fn.is_async,
                            'method': self._extract_http_method(fn.decorators),
                        }
                    })
            
            # Create module nodes for structural files (even with no classes)
            # These are sources/targets for Django-specific edges
            structural_types = {
                'entry', 'settings', 'urls', 'middleware',
                'admin', 'apps', 'migration', 'signals', 'tasks',
            }
            if parsed.file_type in structural_types and not any(
                n['id'] == f"module:{path}" for n in nodes
            ):
                # Build descriptive label
                label = os.path.basename(path)
                if parsed.file_type == 'migration':
                    # Show as "0001_initial" rather than "0001_initial.py"
                    label = label.replace('.py', '')
                
                # Descriptive subtitle
                desc_map = {
                    'settings': 'Project configuration · INSTALLED_APPS, DB, middleware',
                    'urls': f"{len(parsed.url_view_refs)} URL pattern(s)" if parsed.url_view_refs else 'URL routing',
                    'admin': f"Registers {len(parsed.admin_registrations)} model(s)" if parsed.admin_registrations else 'Django admin',
                    'migration': 'Schema migration',
                    'apps': f"AppConfig · {parsed.app_name}" if parsed.app_name else 'App configuration',
                    'entry': 'Application entrypoint',
                    'middleware': 'Request/response middleware',
                    'signals': 'Signal handlers',
                    'tasks': 'Background tasks',
                }
                
                nodes.append({
                    'id': f"module:{path}",
                    'type': 'module',
                    'data': {
                        'label': label,
                        'filepath': path,
                        'description': desc_map.get(parsed.file_type, f"{parsed.file_type.capitalize()} module"),
                        'functionCount': len(parsed.functions),
                        'complexity': parsed.complexity,
                        'category': parsed.file_type,
                        'fileType': parsed.file_type,
                    }
                })
        
        # Auto-layout nodes using a hierarchical approach
        self._layout_nodes(nodes)
        
        return nodes
    
    def _build_edges(self) -> List[Dict[str, Any]]:
        """
        Build edges from imports, inheritance, and Django-specific relationships.
        
        Edge types (visually distinct):
        - inheritance: class -> parent class (solid, neutral)
        - model-rel:   FK/M2M/OneToOne between models (animated, cyan)
        - admin-reg:   admin -> model (dashed, orange)
        - url-route:   urls.py -> view (animated, violet)
        - settings:    settings.py -> app (dashed, amber)
        - migration:   migration file -> models.py (dashed, muted)
        - serializes:  serializer -> model (animated, green)
        - import:      generic fallback (thin, muted)
        """
        edges: List[Dict[str, Any]] = []
        edge_set: Set[Tuple[str, str, str]] = set()  # (source, target, type) triple
        
        def add_edge(source_id: str, target_id: str, edge_type: str, label: str,
                     animated: bool = False, style: Optional[Dict] = None) -> None:
            if source_id == target_id:
                return
            key = (source_id, target_id, edge_type)
            if key in edge_set:
                return
            edge_set.add(key)
            edge = {
                'id': f"{edge_type}-{len(edges)}",
                'source': source_id,
                'target': target_id,
                'type': 'smoothstep',
                'animated': animated,
                'label': label,
                'data': {'kind': edge_type},
            }
            if style:
                edge['style'] = style
                edge['labelStyle'] = {'fill': style.get('stroke', '#94a3b8'), 'fontSize': 10, 'fontWeight': 600}
            edges.append(edge)
        
        for path, parsed in self.parsed_files.items():
            # ── 1. INHERITANCE: class → parent class
            for cls in parsed.classes:
                source_id = f"class:{path}:{cls.name}"
                for base in cls.bases:
                    base_name = base.split('.')[-1]
                    if base_name in self.class_registry:
                        target_path = self.class_registry[base_name]
                        target_id = f"class:{target_path}:{base_name}"
                        add_edge(source_id, target_id, 'inheritance', 'extends',
                                 style={'stroke': '#64748b', 'strokeWidth': 1.5})
            
            # ── 2. MODEL RELATIONSHIPS: Django FK/M2M/OneToOne
            for cls in parsed.classes:
                if not cls.is_model:
                    continue
                source_id = f"class:{path}:{cls.name}"
                for ref in cls.model_refs:
                    target_name = ref.target
                    # Handle 'self' references
                    if target_name in ('self', cls.name):
                        continue
                    # Handle 'AppName.ModelName' strings
                    if '.' in target_name:
                        target_name = target_name.split('.')[-1]
                    if target_name in self.class_registry:
                        target_path = self.class_registry[target_name]
                        target_id = f"class:{target_path}:{target_name}"
                        edge_label = {
                            'ForeignKey': 'FK',
                            'ManyToManyField': 'M2M',
                            'OneToOneField': '1:1',
                        }.get(ref.field_type, 'ref')
                        add_edge(source_id, target_id, 'model-rel',
                                 f"{edge_label}: {ref.field_name}",
                                 animated=True,
                                 style={'stroke': '#22d3ee', 'strokeWidth': 2})
            
            # ── 3. ADMIN REGISTRATIONS: admin.py → Model
            if parsed.file_type == 'admin':
                admin_style = {'stroke': '#f97316', 'strokeWidth': 1.5, 'strokeDasharray': '5 3'}
                # Track which models were handled by a specific ModelAdmin
                handled_models: Set[str] = set()
                
                # ModelAdmin classes with admin_target_model (via @admin.register or Meta.model)
                for cls in parsed.classes:
                    if cls.is_admin and cls.admin_target_model:
                        target = cls.admin_target_model
                        if target in self.class_registry:
                            target_path = self.class_registry[target]
                            source_id = f"class:{path}:{cls.name}"
                            target_id = f"class:{target_path}:{target}"
                            add_edge(source_id, target_id, 'admin-reg', 'admin for',
                                     style=admin_style)
                            handled_models.add(target)
                
                # admin.site.register(Model) calls with no specific ModelAdmin → module-level
                for reg_name in parsed.admin_registrations:
                    if reg_name in handled_models:
                        continue  # Already edged via ModelAdmin class
                    if reg_name in self.class_registry:
                        target_path = self.class_registry[reg_name]
                        target_id = f"class:{target_path}:{reg_name}"
                        source_id = f"module:{path}"
                        add_edge(source_id, target_id, 'admin-reg', 'registers',
                                 style=admin_style)
            
            # ── 4. URL PATTERNS: urls.py → views
            if parsed.file_type == 'urls':
                source_id = f"module:{path}"
                for view_ref in parsed.url_view_refs:
                    # View could be a class (CBV) or function (FBV)
                    if view_ref in self.class_registry:
                        target_path = self.class_registry[view_ref]
                        target_id = f"class:{target_path}:{view_ref}"
                        add_edge(source_id, target_id, 'url-route', 'routes to',
                                 animated=True,
                                 style={'stroke': '#a78bfa', 'strokeWidth': 2})
                    elif view_ref in self.function_registry:
                        target_path = self.function_registry[view_ref]
                        target_id = f"func:{target_path}:{view_ref}"
                        add_edge(source_id, target_id, 'url-route', 'routes to',
                                 animated=True,
                                 style={'stroke': '#a78bfa', 'strokeWidth': 2})
            
            # ── 5. SETTINGS → APPS: settings.py INSTALLED_APPS → app modules
            if parsed.file_type == 'settings':
                source_id = f"module:{path}"
                for app_ref in parsed.installed_apps:
                    # Skip third-party apps - only local ones
                    if app_ref.startswith('django.') or app_ref.startswith('rest_framework'):
                        continue
                    # Match against apps.py files or app folder names
                    for other_path, other_parsed in self.parsed_files.items():
                        other_app_name = other_parsed.app_name or ''
                        app_folder = other_path.split('/')[0] if '/' in other_path else ''
                        
                        if (other_app_name == app_ref
                                or app_folder == app_ref
                                or app_ref.split('.')[-1] == app_folder):
                            # Prefer apps.py, else models.py, else first file
                            if other_parsed.file_type == 'apps':
                                target_id = f"module:{other_path}"
                                add_edge(source_id, target_id, 'settings-app', 'installed',
                                         style={'stroke': '#fbbf24', 'strokeWidth': 1.5, 'strokeDasharray': '3 3'})
                                break
            
            # ── 6. MIGRATIONS → MODELS: migration file → models.py of same app
            if parsed.file_type == 'migration':
                # Find the app this migration belongs to
                parts = path.replace('\\', '/').split('/')
                if 'migrations' in parts:
                    idx = parts.index('migrations')
                    app_folder = '/'.join(parts[:idx])
                    # Find models.py in the same app
                    for other_path, other_parsed in self.parsed_files.items():
                        if other_parsed.file_type == 'models' and other_path.startswith(app_folder + '/'):
                            source_id = f"module:{path}"
                            target_id = f"module:{other_path}"
                            # If models.py has model classes, target first one instead
                            model_classes = [c for c in other_parsed.classes if c.is_model]
                            if model_classes:
                                target_id = f"class:{other_path}:{model_classes[0].name}"
                            add_edge(source_id, target_id, 'migration', 'migrates',
                                     style={'stroke': '#64748b', 'strokeWidth': 1, 'strokeDasharray': '2 2'})
                            break
            
            # ── 7. SERIALIZERS → MODELS: Serializer.Meta.model
            for cls in parsed.classes:
                if cls.is_serializer and cls.serializer_model:
                    target = cls.serializer_model
                    if target in self.class_registry:
                        target_path = self.class_registry[target]
                        source_id = f"class:{path}:{cls.name}"
                        target_id = f"class:{target_path}:{target}"
                        add_edge(source_id, target_id, 'serializes', 'serializes',
                                 animated=True,
                                 style={'stroke': '#4ade80', 'strokeWidth': 1.5})
            
            # ── 8. GENERIC IMPORTS (fallback — only if no specialized edge exists)
            for imp in parsed.imports:
                for name in imp.names:
                    if name in self.class_registry:
                        target_path = self.class_registry[name]
                        if target_path == path:
                            continue
                        source_candidates = self._get_nodes_in_file(path)
                        target_id = f"class:{target_path}:{name}"
                        for source_id in source_candidates[:1]:
                            add_edge(source_id, target_id, 'import', 'imports',
                                     style={'stroke': '#475569', 'strokeWidth': 1, 'strokeDasharray': '4 2'})
        
        return edges
    
    def _get_nodes_in_file(self, filepath: str) -> List[str]:
        """Get all node IDs for a given file."""
        nodes = []
        parsed = self.parsed_files.get(filepath)
        if parsed:
            for cls in parsed.classes:
                nodes.append(f"class:{filepath}:{cls.name}")
            for fn in parsed.functions:
                if fn.is_route:
                    nodes.append(f"func:{filepath}:{fn.name}")
        return nodes
    
    def _determine_class_node_type(self, cls: ParsedClass) -> str:
        """Determine which visual node type to use for a class."""
        if cls.is_model:
            return 'model'
        if cls.is_view or cls.is_viewset:
            return 'controller'
        if cls.is_serializer:
            return 'schema'
        if cls.is_admin:
            return 'service'
        # Check name patterns
        name_lower = cls.name.lower()
        if 'repository' in name_lower or 'repo' in name_lower:
            return 'repository'
        if 'service' in name_lower:
            return 'service'
        if 'controller' in name_lower or 'handler' in name_lower:
            return 'controller'
        if 'domain' in name_lower or 'entity' in name_lower:
            return 'domain'
        return 'utility'
    
    def _get_class_category(self, cls: ParsedClass) -> str:
        """Get semantic category for a class."""
        if cls.is_model: return 'data'
        if cls.is_view or cls.is_viewset: return 'interface'
        if cls.is_serializer: return 'data'
        if cls.is_admin: return 'interface'
        return 'domain'
    
    def _extract_http_method(self, decorators: List[str]) -> str:
        """Extract HTTP method from route decorators."""
        methods = {'get', 'post', 'put', 'delete', 'patch', 'head', 'options'}
        for dec in decorators:
            dec_lower = dec.lower()
            for method in methods:
                if method in dec_lower:
                    return method.upper()
        return 'ANY'
    
    def _layout_nodes(self, nodes: List[Dict[str, Any]]) -> None:
        """Apply hierarchical auto-layout to nodes."""
        # Group nodes by type for columnar layout
        type_order = ['app', 'entryInterface', 'route', 'controller', 'service', 'domain',
                       'repository', 'schema', 'model', 'module', 'utility']

        by_type: Dict[str, List[Dict]] = defaultdict(list)
        for node in nodes:
            by_type[node['type']].append(node)

        x_offset = 100
        col_width = 300
        row_height = 150
        # Slight x-stagger per column to break strict alignment
        stagger_x = 30

        col_idx = 0
        for node_type in type_order:
            if node_type not in by_type:
                continue

            type_nodes = by_type[node_type]
            for i, node in enumerate(type_nodes):
                # Alternate stagger: even rows go right, odd rows go left
                jitter_x = stagger_x if i % 2 == 0 else 0
                node['position'] = {
                    'x': x_offset + jitter_x,
                    'y': 80 + i * row_height,
                }
            x_offset += col_width
            col_idx += 1

        # Handle any types not in our order
        for node_type, type_nodes in by_type.items():
            if node_type not in type_order:
                for i, node in enumerate(type_nodes):
                    if 'position' not in node:
                        node['position'] = {
                            'x': x_offset,
                            'y': 80 + i * row_height,
                        }
                x_offset += col_width
    
    def _calculate_metrics(self) -> Dict[str, Any]:
        """Calculate project-wide metrics."""
        total_files = len(self.parsed_files)
        total_classes = sum(len(p.classes) for p in self.parsed_files.values())
        total_functions = sum(len(p.functions) for p in self.parsed_files.values())
        total_lines = sum(p.line_count for p in self.parsed_files.values())
        total_complexity = sum(p.complexity for p in self.parsed_files.values())
        
        avg_complexity = round(total_complexity / max(total_files, 1), 2)
        
        return {
            'total_files': total_files,
            'total_classes': total_classes,
            'total_functions': total_functions,
            'total_lines': total_lines,
            'average_complexity': avg_complexity,
            'total_models': sum(
                sum(1 for c in p.classes if c.is_model) 
                for p in self.parsed_files.values()
            ),
            'total_views': sum(
                sum(1 for c in p.classes if c.is_view or c.is_viewset) 
                for p in self.parsed_files.values()
            ),
            'total_routes': sum(
                sum(1 for f in p.functions if f.is_route) 
                for p in self.parsed_files.values()
            ),
        }
    
    def _generate_insights(self) -> Dict[str, Any]:
        """Generate architectural insights and warnings."""
        insights = {
            'circular_dependencies': self._detect_circular_deps(),
            'high_complexity_files': self._find_high_complexity(),
            'orphan_files': self._find_orphan_files(),
            'architecture_smells': self._detect_smells(),
        }
        return insights
    
    def _detect_circular_deps(self) -> List[List[str]]:
        """Detect circular dependencies between files."""
        # Build file-level import graph as plain dict (not defaultdict) to avoid
        # accidental insertions during DFS traversal.
        imports_graph: Dict[str, Set[str]] = {}
        
        for path, parsed in self.parsed_files.items():
            targets: Set[str] = set()
            for imp in parsed.imports:
                for name in imp.names:
                    if name in self.class_registry:
                        targets.add(self.class_registry[name])
            imports_graph[path] = targets
        
        # DFS to find cycles
        cycles: List[List[str]] = []
        WHITE, GRAY, BLACK = 0, 1, 2
        color: Dict[str, int] = {}
        
        def dfs(node: str, path: List[str]) -> None:
            state = color.get(node, WHITE)
            if state == GRAY:
                if node in path:
                    cycle_start = path.index(node)
                    cycles.append(path[cycle_start:] + [node])
                return
            if state == BLACK:
                return
            color[node] = GRAY
            # Use .get() to avoid creating new keys during iteration
            for neighbor in imports_graph.get(node, ()):
                dfs(neighbor, path + [node])
            color[node] = BLACK
        
        # Snapshot keys to avoid mutation issues
        for node in list(imports_graph.keys()):
            if color.get(node, WHITE) == WHITE:
                dfs(node, [])
        
        return cycles[:5]
    
    def _find_high_complexity(self) -> List[Dict[str, Any]]:
        """Find files with high complexity that need refactoring."""
        high_complexity = []
        for path, parsed in self.parsed_files.items():
            if parsed.complexity > 20:
                high_complexity.append({
                    'path': path,
                    'complexity': parsed.complexity,
                    'suggestion': 'Consider breaking this file into smaller modules',
                })
        return sorted(high_complexity, key=lambda x: -x['complexity'])[:10]
    
    def _find_orphan_files(self) -> List[str]:
        """Find files that aren't imported anywhere (potential dead code)."""
        imported_paths = set()
        for path, parsed in self.parsed_files.items():
            for imp in parsed.imports:
                for name in imp.names:
                    if name in self.class_registry:
                        imported_paths.add(self.class_registry[name])
        
        orphans = []
        for path, parsed in self.parsed_files.items():
            if path not in imported_paths and parsed.file_type not in ('entry', 'urls', 'settings'):
                if parsed.classes or parsed.functions:
                    orphans.append(path)
        
        return orphans[:10]
    
    def _detect_smells(self) -> List[Dict[str, str]]:
        """Detect common architecture smells."""
        smells = []
        
        # God class detection
        for path, parsed in self.parsed_files.items():
            for cls in parsed.classes:
                if len(cls.methods) > 20:
                    smells.append({
                        'type': 'God Class',
                        'location': f"{cls.name} in {path}",
                        'severity': 'high',
                        'suggestion': f'{cls.name} has {len(cls.methods)} methods. Consider splitting.',
                    })
        
        # Too many models in one file
        for path, parsed in self.parsed_files.items():
            model_count = sum(1 for c in parsed.classes if c.is_model)
            if model_count > 8:
                smells.append({
                    'type': 'Cluttered Models',
                    'location': path,
                    'severity': 'medium',
                    'suggestion': f'{model_count} models in one file. Split by domain.',
                })
        
        return smells[:10]


# Singleton instance
project_graph_builder = ProjectGraphBuilder()


def _is_django_migration_file(path: str) -> bool:
    """True for files inside migrations/ except __init__.py (noise on architecture canvas)."""
    p = path.replace("\\", "/").lower()
    if "/migrations/" not in p:
        return False
    base = os.path.basename(path).lower()
    return base != "__init__.py"


def build_project_graph(
    files: List[Dict[str, str]],
    *,
    exclude_migrations: bool = True,
) -> Dict[str, Any]:
    """Main entry point - builds graph from file list."""
    if exclude_migrations:
        files = [f for f in files if not _is_django_migration_file(f.get("path", ""))]
    builder = ProjectGraphBuilder()
    return builder.build_graph(files)

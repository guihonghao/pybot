var urlParams;
var f1, f2;
var container, camera, controls, scene, renderer;
var ws;

var mouse = new THREE.Vector2();
var hoverCamera, raycaster, parentTransform;
var capturer = null;
var rec_button; 
var selectedCamera;
var imagePlane, imagePlaneCamera;
var imagePlaneOld, imagePlaneCameraOld;
var scene_group, grid_group;
var pointCloudMaterial, lineMaterial;
var reconstructions;
var collections_visibles = [];
var reconstruction_visibles = [];
var reconstruction_groups = [];

var obj_axes_geom = null;
var obj_collections = {};
var pc_collections = {};
var pc_obj_lut = {};

var point_clouds = [];
var camera_lines = [];
var gps_lines = [];
var imagePlanes = [];
var imagePlaneCameras = [];
var imageMaterials = [];
var num_preview_plane = 5;
var moveSpeed = 0.2;
var turnSpeed = 0.1;
var previousShot = undefined;
var validMoves;
var movingMode = 'orbit';
var savedOptions = {
    cameraSize: 0,
    pointSize: 0,
    showThumbnail: false,
    showImagePlane: true,
    drawGrid: false,
    followCamera: false, 
    drawGPS: false
};

var options = {
    record: function() {
        if (capturer == null) { 
            // Create a capturer that exports a WebM video
            capturer = new CCapture(
                { framerate: 30,
                  format: 'webm',
                  // quality: 90,
                  display: true, 
                  // workersPath: 'js/',
                  verbose: false }
            );
            capturer.start();
            console.log('Start recording ...');
            rec_button.name('Recording ...');
        } else {
            capturer.stop();
            capturer.save();
            capturer = null;
            console.log('Stop recording ...');
            rec_button.name('Record');
        }    
    }, 
    cameraSize: 0.9,
    pointSize: 0.1,
    imagePlaneSize: 50,
    showThumbnail: true,
    showImagePlane: false,
    drawGrid: true,
    followCamera: true,
    drawGPS: false,
    animationSpeed: 0.5,
    imagePlaneOpacity: 1,
    cameraColor: new THREE.Color(0xFFFFFF),
    hoverCameraColor: new THREE.Color(0xFF8888),
    selectedCameraColor: new THREE.Color(0xFFFF88),
    reconstruction_visibles: {},
    collections_visibles: {},
    resolution: 'original',
    allNone: function () {
        var someone = false;
        for (var r = 0; r < reconstructions.length; ++r) {
            if (options.reconstruction_visibles[r]) {
                someone = true;
                break;
            }
        }
        for (var r = 0; r < reconstructions.length; ++r) {
            options.reconstruction_visibles[r] = !someone;
            reconstruction_groups[r].traverse(function (object) {
                object.visible = !someone;
            });
        }
        render();
    }
};


$('#loading').remove();
init();
animate();
// getData();

function addDatGui(){
    var gui = new dat.GUI();

    f1 = gui.addFolder('Options');
    f1.add(options, 'pointSize', 0, 1)
        .listen()
        .onChange(setPointSize);
    f1.add(options, 'cameraSize', 0, 2)
        .listen()
        .onChange(setCameraSize);
    f1.add(options, 'imagePlaneSize', 1, 200)
        .onChange(function(value) {
            options.imagePlaneSize *= 1.5;
            imagePlane.geometry = imagePlaneGeo(imagePlaneCameraOld.reconstruction, imagePlaneCameraOld.shot_id);
            options.imagePlaneSize /= 1.5;
            imagePlane.geometry = imagePlaneGeo(imagePlaneCamera.reconstruction, imagePlaneCamera.shot_id);
            render();
        });
    f1.add(options, 'animationSpeed', 0, 0.5)
        .onChange(function(value) {
            controls.animationSpeed = value;
            invokeJourneyWrapper(function () { journeyWrapper.updateInterval(); });
        });
    f1.add(options, 'resolution', [ '320', '640', 'original' ] );
    f1.add(options, 'showThumbnail')
        .listen()
        .onChange(setShowThumbnail);
    f1.add(options, 'drawGrid')
        .listen()
        .onChange(setDrawGrid);
    f1.add(options, 'followCamera')
        .listen()
        .onChange(setFollowCamera);
    f1.add(options, 'showImagePlane')
        .listen()
        .onChange(setShowImagePlane);
    f1.add(options, 'drawGPS')
        .listen()
        .onChange(setDrawGPS);
    f1.open();

    f2 = gui.addFolder('Collections');
    rec_button = f2.add(options, 'record');
    rec_button.name('Record');
    f2.open();
    // var f3 = gui.addFolder('Reconstructions')
    // f3.add(options, 'allNone');
    // options.reconstruction_visibles = [];
    // for (var r = 0; r < reconstructions.length; ++r) {
    //     options.reconstruction_visibles[r] = true;
    //     f3.add(options.reconstruction_visibles, r, true)
    //         .onChange(
    //             (function(rr) {
    //                 return function (value) {
    //                     reconstruction_groups[rr].traverse(
    //                         function (object) { object.visible = value; } );
    //                     render();
    //                 }
    //             })(r)
    //         ).listen();
    // }
    // f3.close();

    gui.close();
}

function setPointSize(value) {
    options.pointSize = value;
    pointCloudMaterial.size = value;
    for (var i = 0; i < point_clouds.length; ++i) {
        point_clouds[i].visible = (value > 0);
    }
    render();
}

function setCameraSize(value) {
    options.cameraSize = value;
    for (var r = 0; r < reconstructions.length; ++r) {
        updateCameraLines(reconstructions[r]);
    }
    render();
}

function setShowThumbnail(value) {
    options.showThumbnail = value;
    $('#info').css('visibility', value ? 'visible' : 'hidden');
}

function setShowImagePlane(value) {
    options.showImagePlane = value;
    imagePlane.visible = value;
    if (movingMode === 'walk') {
        imagePlaneOld.visible = value;
    } else {
        imagePlaneOld.visible = false;
    }
    render();
}

function setDrawGrid(value) {
    options.drawGrid = value;
    grid_group.visible = value;
    render();
}

function setFollowCamera(value) {
    options.followCamera = value;
}

function setDrawGPS(value) {
    options.drawGPS = value;
    for (var i = 0; i < gps_lines.length; ++i) {
        gps_lines[i].visible = value;
    }
    render();
}

function setMovingMode(mode) {
    if (mode != movingMode) {
        movingMode = mode;
        if (mode == 'orbit') {
            invokeJourneyWrapper(function () { journeyWrapper.stop(); journeyWrapper.addShowPathController(); });
            resetWalkMode();
            swapOptions();
            controls.noRotate = false;
            controls.noLookAround = false;
            controls.noPan = false;
            controls.noZoom = false;
            controls.noKeys = false;
            controls.animationPosition.z += 10;
            controls.dollyOut(4);
            imagePlane.material.depthWrite = true;
            imagePlaneOld.material.depthWrite = true;
            $('#navigation').hide();
        } else if (mode == 'walk') {
            invokeJourneyWrapper(function () { journeyWrapper.removeShowPathController(); });
            swapOptions();
            // controls.noRotate = true;
            // controls.noLookAround = true;
            // controls.noPan = true;
            // controls.noZoom = true;
            // controls.noKeys = true;
            imagePlane.material.depthWrite = false;
            imagePlaneOld.material.depthWrite = false;
            $('#navigation').show();
        }
    }
}

function resetWalkMode() {
    previousShot = undefined;
}

function swapOptions() {
    var tmpOptions = {
        pointSize: savedOptions.pointSize,
        cameraSize: savedOptions.cameraSize,
        showThumbnail: savedOptions.showThumbnail,
        showImagePlane: savedOptions.showImagePlane,
        drawGrid: savedOptions.drawGrid,
        followCamera: savedOptions.followCamera,
        drawGPS: savedOptions.drawGPS
    };

    savedOptions.pointSize = options.pointSize;
    savedOptions.cameraSize = options.cameraSize;
    savedOptions.showThumbnail = options.showThumbnail;
    savedOptions.showImagePlane = options.showImagePlane;
    savedOptions.drawGrid = options.drawGrid;
    savedOptions.followCamera = options.followCamera;
    savedOptions.drawGPS = options.drawGPS;

    setPointSize(tmpOptions.pointSize);
    setCameraSize(tmpOptions.cameraSize);
    setShowThumbnail(tmpOptions.showThumbnail);
    setShowImagePlane(tmpOptions.showImagePlane);
    setDrawGrid(tmpOptions.drawGrid);
    setFollowCamera(tmpOptions.followCamera);
    setDrawGPS(tmpOptions.drawGPS);
}

function imageURL(shot_id) {
    var url = urlParams.file;
    var slash = url.lastIndexOf('/');
    var imagePath = '/images' + options.resolution.replace('original', '')
    return url.substring(0, slash) + imagePath +'/' + shot_id;
}

function parseUrl() {
    var match,
        pl     = /\+/g,  // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
        hash  = window.location.hash.substring(1);

    urlParams = {};
    while (match = search.exec(hash))
        urlParams[decode(match[1])] = decode(match[2]);
}

function invokeJourneyWrapper(action) {
    if (typeof journeyWrapper != "undefined") {
        return action();
    }
}

function getData() {
    parseUrl();

    if ('res' in urlParams) options.resolution = urlParams.res;

    jQuery.getJSON(urlParams.file, function(data) {
        if ('cameras' in data) {
            reconstructions = [data];
        } else {
            reconstructions = data;
        }
        $('#loading').remove();
        init();
        animate();

        invokeJourneyWrapper(function () { journeyWrapper.initialize(); });
    });
}

function rotate(vector, angleaxis) {
    var v = new THREE.Vector3(vector[0], vector[1], vector[2]);
    var axis = new THREE.Vector3(angleaxis[0],
                                 angleaxis[1],
                                 angleaxis[2]);
    var angle = axis.length();
    axis.normalize();
    var matrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
    v.applyMatrix4(matrix);
    return v;
}

function opticalCenter(shot) {
    var angleaxis = [-shot.rotation[0],
                     -shot.rotation[1],
                     -shot.rotation[2]];
    var Rt = rotate(shot.translation, angleaxis);
    Rt.negate();
    return Rt;
}

function viewingDirection(shot) {
    var angleaxis = [-shot.rotation[0],
                     -shot.rotation[1],
                     -shot.rotation[2]];
    return rotate([0,0,1], angleaxis);
}

function pixelToVertex(cam, shot, u, v, scale) {
    // Projection model:
    // xc = R * x + t
    // u = focal * xc / zc
    // v = focal * yc / zc
    var focal = cam.focal || 0.3;
    var zc = scale;
    var xc = u / focal * zc;
    var yc = v / focal * zc;

    var xct = [xc - shot.translation[0],
               yc - shot.translation[1],
               zc - shot.translation[2]];


    var angleaxis = [-shot.rotation[0],
                     -shot.rotation[1],
                     -shot.rotation[2]];

    return rotate(xct, angleaxis);
}

function initCameraLines(reconstruction) {
    var lines = []
    for (var shot_id in reconstruction.shots) {
        if (reconstruction.shots.hasOwnProperty(shot_id)) {
            var lmaterial = new THREE.LineBasicMaterial({size: 0.1 })
            lmaterial.color = options.cameraColor;
            var linegeo = cameraLineGeo(reconstruction, shot_id);
            var line = new THREE.LineSegments(linegeo, lmaterial, THREE.LinePieces);
            line.reconstruction = reconstruction;
            line.shot_id = shot_id;
            lines.push(line);
        }
    }
    return lines;
}

function updateCameraLines() {
    for (var i = 0; i < camera_lines.length; ++i) {
        var linegeo = cameraLineGeo(camera_lines[i].reconstruction, camera_lines[i].shot_id);
        camera_lines[i].geometry.vertices = linegeo.vertices;
        camera_lines[i].geometry.verticesNeedUpdate = true;
    }
}

function cameraLineGeo(reconstruction, shot_id) {
    var shot = reconstruction.shots[shot_id];
    var cam = reconstruction.cameras[shot.camera];
    var ocenter = opticalCenter(shot);
    var dx = cam.width / 2.0 / Math.max(cam.width, cam.height);
    var dy = cam.height / 2.0 / Math.max(cam.width, cam.height);
    var top_left     = pixelToVertex(cam, shot, -dx, -dy, options.cameraSize);
    var top_right    = pixelToVertex(cam, shot,  dx, -dy, options.cameraSize);
    var bottom_right = pixelToVertex(cam, shot,  dx,  dy, options.cameraSize);
    var bottom_left  = pixelToVertex(cam, shot, -dx,  dy, options.cameraSize);
    var linegeo = new THREE.Geometry();
    linegeo.vertices.push(ocenter);
    linegeo.vertices.push(top_left);
    linegeo.vertices.push(ocenter);
    linegeo.vertices.push(top_right);
    linegeo.vertices.push(ocenter);
    linegeo.vertices.push(bottom_right);
    linegeo.vertices.push(ocenter);
    linegeo.vertices.push(bottom_left);
    linegeo.vertices.push(top_left);
    linegeo.vertices.push(top_right);
    linegeo.vertices.push(top_right);
    linegeo.vertices.push(bottom_right);
    // linegeo.vertices.push(bottom_right);
    // linegeo.vertices.push(bottom_left);
    linegeo.vertices.push(bottom_left);
    linegeo.vertices.push(top_left);
    return linegeo;
}

function imagePlaneGeo(reconstruction, shot_id) {
    var shot = reconstruction.shots[shot_id];
    var cam = reconstruction.cameras[shot.camera];

    if ('vertices' in shot) {
        var geometry = new THREE.Geometry();
        for (var i = 0; i < shot['vertices'].length; ++i) {
            geometry.vertices.push(
                new THREE.Vector3(
                    shot['vertices'][i][0],
                    shot['vertices'][i][1],
                    shot['vertices'][i][2]
                )
            );
        }
        for (var i = 0; i < shot['faces'].length; ++i) {
            var v0 = shot['faces'][i][0];
            var v1 = shot['faces'][i][1];
            var v2 = shot['faces'][i][2];

            geometry.faces.push(new THREE.Face3(v0, v1, v2));
        }
        return geometry;
    } else {
        if (cam.projection_type == "spherical" || cam.projection_type == "equirectangular") {
            return imageSphereGeoFlat(cam, shot);
        } else {
            return imagePlaneGeoFlat(cam, shot);
        }
    }
}

function imagePlaneGeoFlat(cam, shot) {
    var geometry = new THREE.Geometry();
    var dx = cam.width / 2.0 / Math.max(cam.width, cam.height);
    var dy = cam.height / 2.0 / Math.max(cam.width, cam.height);
    var top_left     = pixelToVertex(cam, shot, -dx, -dy, options.imagePlaneSize);
    var top_right    = pixelToVertex(cam, shot,  dx, -dy, options.imagePlaneSize);
    var bottom_right = pixelToVertex(cam, shot,  dx,  dy, options.imagePlaneSize);
    var bottom_left  = pixelToVertex(cam, shot, -dx,  dy, options.imagePlaneSize);

    geometry.vertices.push(
        top_left,
        bottom_left,
        bottom_right,
        top_right
    );
    geometry.faces.push(
        new THREE.Face3(0, 1, 3),
        new THREE.Face3(1, 2, 3)
    );
    return geometry;
}

function imageSphereGeoFlat(cam, shot) {
    geometry = new THREE.SphereGeometry(
        options.imagePlaneSize,
        20,
        40
    );
    var center = pixelToVertex(cam, shot, 0, 0, 0);
    geometry.applyMatrix(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z));
    return geometry;
}

function createImagePlaneMaterial(cam, shot, shot_id) {
    var imageTexture = THREE.ImageUtils.loadTexture(imageURL(shot_id));
    imageTexture.minFilter = THREE.LinearFilter;

    var material = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: true,
        uniforms: {
            projectorMat: {
                type: 'm4',
                value: projectorCameraMatrix(cam, shot)
            },
            projectorTex: {
                type: 't',
                value: imageTexture
            },
            opacity: {
                type: 'f',
                value: options.imagePlaneOpacity
            },
            focal: {
                type: 'f',
                value: cam.focal
            },
            k1: {
                type: 'f',
                value: cam.k1
            },
            k2: {
                type: 'f',
                value: cam.k2
            },
            scale_x: {
                type: 'f',
                value: Math.max(cam.width, cam.height) / cam.width
            },
            scale_y: {
                type: 'f',
                value: Math.max(cam.width, cam.height) / cam.height
            }
        },
        vertexShader:   imageVertexShader(cam),
        fragmentShader: imageFragmentShader(cam)
    });

    return material;
}

function imageVertexShader(cam) {
    return $('#vertexshader').text();
}

function imageFragmentShader(cam) {
    if (cam.projection_type == 'equirectangular' || cam.projection_type == 'spherical')
        return $('#fragmentshader_equirectangular').text();
    else if (cam.projection_type == 'fisheye')
        return $('#fragmentshader_fisheye').text();
    else
        return $('#fragmentshader').text();
}

function projectorCameraMatrix(cam, shot) {
    var angleaxis = shot.rotation;
    var axis = new THREE.Vector3(angleaxis[0],
                                 angleaxis[1],
                                 angleaxis[2]);
    var angle = axis.length();
    axis.normalize();
    var rotation = new THREE.Matrix4().makeRotationAxis(axis, angle);
    var t = shot.translation;
    var translation = new THREE.Vector3(t[0], t[1], t[2]);
    rotation.setPosition(translation);

    return rotation;

    if (cam.projection_type == 'equirectangular' || cam.projection_type == 'spherical')
        return rotation
    var dx = cam.width / Math.max(cam.width, cam.height) / cam.focal;
    var dy = cam.height / Math.max(cam.width, cam.height) / cam.focal;
    var projection = new THREE.Matrix4().makeFrustum(-dx, +dx, +dy, -dy, -1, -1000);
    return projection.multiply(rotation);
}

function convertTypedArray(src, type) {
    var buffer = new ArrayBuffer(src.byteLength);
    var baseView = new src.constructor(buffer).set(src);
    return new type(buffer);
}

function split_channel_data(ch_data) {
    val = ' '.charCodeAt(0);
    for (var i=0, L=ch_data.length; i < L; i++) {
        if (ch_data[i] == val) {
            return { channel: ch_data.slice(0,i),
                     data: ch_data.slice(i+1) }
        }
    }
    return {channel: -1, data: -1};
}

function update_camera_pose(msg) {
    if (!options.followCamera)
        return;
    
    // Place camera
    var mat = new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion(msg.orientation[1],
                             msg.orientation[2],
                             msg.orientation[3],
                             msg.orientation[0])).transpose();

    var d = mat.elements;
    var ya = new THREE.Vector3(d[1], d[5], d[9]).negate();
    var za = new THREE.Vector3(d[2], d[6], d[10]);
    controls.goto_up(
        new THREE.Vector3(msg.pos[0], msg.pos[1], msg.pos[2]),
        new THREE.Vector3(za.x * 1 + msg.pos[0],
                                    za.y * 1 + msg.pos[1],
                          za.z * 1 + msg.pos[2]),
        new THREE.Vector3(ya.x, ya.y, ya.z)
    );
    
}

function add_points_to_scene_group(msg) {
    // Note: All points from the same channel are associated with the
    // same frame_id (i.e. collection_id=uuid(pose_channel), element_id=0,...n)
    
    // Clean up point clouds for corresponding channel (indexed by msg.id)
    if (msg.reset && msg.id in pc_obj_lut) {

        // Tuple (element_group, point_cloud)
        for (var key in pc_obj_lut[msg.id]) {
            gp_pc = pc_obj_lut[msg.id][key];
            gp_pc[0].remove(gp_pc[1]);
        }
        delete pc_obj_lut[msg.id];
    }

    // Initialize pc-obj LUT
    if (!(msg.id in pc_obj_lut)) {
        pc_obj_lut[msg.id] = [];
    }
    
    // Render points
    for (var i = 0; i < msg.pointLists.length; ++i) {
        var pc = msg.pointLists[i];
        // var colors = pc.colors[0];

        // Find collection_id, and element_id pose
        try {
            cid = pc.collection, eid = pc.elementId;
            var element_group = obj_collections[cid][eid];
        } catch (err) {
            console.log('Error finding collection, and element_id ' +
                        cid + ':' + eid);
            return;
        }

        // Convert bytes to float32array
        var pointsf = convertTypedArray(pc.points, Float32Array);
        var colorsf = convertTypedArray(pc.colors, Float32Array);
        
        // Add points into buffer geometry
        var geom = new THREE.BufferGeometry();
        geom.addAttribute(
            'position',
            new THREE.BufferAttribute(pointsf, 3));
        geom.addAttribute(
            'color',
            new THREE.BufferAttribute(colorsf, 3));

        var item; 

        // Render points
        switch (msg.type) {
        case point3d_list_collection_t.getEnum('point_type').POINT:
            item = new THREE.Points(
                geom, pointCloudMaterial);
            break;
            
        // Render lines
        case point3d_list_collection_t.getEnum('point_type').LINES:
            item = new THREE.LineSegments(
                geom, lineMaterial, THREE.LinePieces);
            break;
            
        // Render triangles
        case point3d_list_collection_t.getEnum('point_type').TRIANGLES:
            // Create triangles and compute normals
            for (var j = 0, pc_sz = pc.points.length / 3;
                 j < pc_sz; ++j) {
                geom.faces.push(
                    new THREE.Face3( 3*j, 3*j+1, 3*j+2 ));
            }
            mesh_material = new THREE.MeshBasicMaterial({
                color: 0xFFFF00,
            });
            item = new THREE.Mesh(geom, mesh_material);
            break;

        default:
            console.log('Unknown type ' + msg.type);
        }

        // For every point cloud added, maintain the corresponding
        // element_group it belongs to (for future removal purposes)
        pc_obj_lut[msg.id].push([element_group, item]);
        element_group.add(item);
        
        // Element group culling
        element_group.frustumCulled = true;
        
        // Add group to scene
        scene_group.add(element_group);
        scene_group.frustumCulled = true;
        
    }
    
    // for (var r = 0; r < reconstructions.length; ++r) {
    //     var reconstruction = reconstructions[r];
    //     reconstruction_groups[r] = new THREE.Object3D();
    //     var group = reconstruction_groups[r];

    //     // Points.
    //     var points = new THREE.Geometry();
    //     for (var point_id in reconstruction.points) {
    //         if (reconstruction.points.hasOwnProperty(point_id)) {
    //             var p = reconstruction.points[point_id].coordinates;
    //             var c = reconstruction.points[point_id].color;
    //             var color = new THREE.Color();
    //             color.setRGB(c[0] / 255., c[1] / 255., c[2] / 255.)
    //             points.vertices.push(new THREE.Vector3(p[0], p[1], p[2]));
    //             points.colors.push(color);
    //         }
    //     }
    //     var point_cloud = new THREE.PointCloud(points, pointCloudMaterial);
    //     point_clouds.push(point_cloud);
    //     group.add(point_cloud);

    //     // Cameras.
    //     var lines = initCameraLines(reconstruction);
    //     for (var i = 0; i < lines.length; ++i) {
    //         group.add(lines[i]);
    //         camera_lines.push(lines[i]);
    //     }

    //     // GPS positions
    //     for (var shot_id in reconstruction.shots) {
    //         if (reconstruction.shots.hasOwnProperty(shot_id)) {
    //             var shot = reconstruction.shots[shot_id];
    //             var ocenter = opticalCenter(shot);
    //             var gps = shot.gps_position;

    //             if (gps){
    //                 var linegeo = new THREE.Geometry();
    //                 linegeo.vertices.push(
    //                     ocenter,
    //                     new THREE.Vector3(gps[0], gps[1], gps[2])
    //                 );
    //                 var lineMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff });
    //                 var line = new THREE.Line(linegeo, lineMaterial, THREE.LinePieces);
    //                 line.visible = options.drawGPS;
    //                 group.add(line);
    //                 gps_lines.push(line);
    //             }
    //         }
    //     }

    //     scene_group.add(group);
    // }

}

function add_objects_to_scene_group(msg) {

    // Clean up poses for corresponding channel (indexed by msg.id)
    if (msg.reset && msg.id in obj_collections) {
        for (var obj_id in obj_collections[msg.id]) {
            // Reomve obj from scene_group
            scene_group.remove(obj_collections[msg.id][obj_id]);
        }
        delete obj_collections[msg.id];
    }

    // Retreive object collection
    // Object.keys(obj_collections_lut).length == 0
    if (!(msg.id in obj_collections)) {
        obj_collections[msg.id] = {};
    }
    
    // Render poses
    for (var i = 0; i < msg.objs.length; ++i) {
        var obj = msg.objs[i];

        // Create object group for obj_id
        var update = false;
        if (!(obj.id in obj_collections[msg.id])) { 
            obj_collections[msg.id][obj.id] = new THREE.Object3D();
            console.log('adding element ' + msg.id + ':' + obj.id);
        } else {
            update = true;
            console.log('updating element ' + msg.id + ':' + obj.id);
        }
        
        // Transform obj_id
        var obj_group = obj_collections[msg.id][obj.id];
        obj_group.setRotationFromEuler(
            new THREE.Euler(obj.roll, obj.pitch, obj.yaw, 'ZYX'));
        obj_group.position.copy(new THREE.Vector3(obj.x, obj.y, obj.z));

        // First time add
        if (!update) {
            // Add axes to obj_id
            obj_group.add(getAxes(0.2));

            // Add obj_id to scene
            scene_group.add(obj_group);
        }
    }
    scene_group.frustumCulled = true;
}

function addGridAxes() {
    // add the three markers to the axes
    addAxis(new THREE.Vector3(1, 0, 0));
    addAxis(new THREE.Vector3(0, 1, 0));
    addAxis(new THREE.Vector3(0, 0, 1));
}

function addAxis(axis) {
    // create the cylinders for the objects
    var shaftRadius = 0.02;
    var headRadius = 0.04;
    var headLength = 0.1;

    var lineGeom = new THREE.CylinderGeometry(
        shaftRadius, shaftRadius, 1);
    var headGeom = new THREE.CylinderGeometry(
        0, headRadius, headLength);

    // set the color of the axis
    var color = new THREE.Color();
    color.setRGB(axis.x, axis.y, axis.z);
    var material = new THREE.MeshBasicMaterial({
      color : color.getHex()
    });

    var axis_group = new THREE.Object3D();
    
    // setup the rotation information
    var rotAxis = new THREE.Vector3();
    rotAxis.crossVectors(axis, new THREE.Vector3(0, -1, 0));
    var rot = new THREE.Quaternion();
    rot.setFromAxisAngle(rotAxis, 0.5 * Math.PI);

    // create the arrow
    var arrow = new THREE.Mesh(headGeom, material);
    arrow.matrix.makeRotationFromQuaternion(rot);
    arrow.matrix.setPosition(axis.multiplyScalar(1).clone());
    arrow.matrixAutoUpdate = false;
    axis_group.add(arrow);

    // create the line
    var line = new THREE.Mesh(lineGeom, material);
    line.matrix.makeRotationFromQuaternion(rot);
    line.matrix.setPosition(axis.multiplyScalar(0.5).clone());
    line.matrixAutoUpdate = false;
    axis_group.add(line);

    // add axis to group
    grid_group.add(axis_group);
}

function getAxes(sz) {
    // var pointsf = new Float32Array([0, 0, 0,
    //                             sz, 0, 0,
    //                             0, 0, 0,
    //                             0, sz, 0,
    //                             0, 0, 0,
    //                             0, 0, sz]);
    // var colorsf = new Float32Array([1.0, 0, 0,
    //                             1.0, 0, 0,
    //                             0, 1.0, 0, 
    //                             0, 1.0, 0,
    //                             0, 0, 1.0,
    //                             0, 0, 1.0]);
    
    // var geom = new THREE.BufferGeometry();
    // geom.addAttribute(
    //     'position',
    //     new THREE.BufferAttribute(pointsf, 3));
    // geom.addAttribute(
    //     'color',
    //     new THREE.BufferAttribute(colorsf, 3));
    if (!obj_axes_geom) { 
        obj_axes_geom = new THREE.Geometry();
        obj_axes_geom.vertices = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(sz, 0, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, sz, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, sz)
        ];
        obj_axes_geom.colors = [
            new THREE.Color( 0xff0000 ),
            new THREE.Color( 0xff0000 ),
            new THREE.Color( 0x00ff00 ),
            new THREE.Color( 0x00ff00 ),
            new THREE.Color( 0x0000ff ),
            new THREE.Color( 0x0000ff )
        ];
    }

    // Return new axis with cached geometry
    var axis = new THREE.LineSegments(
        obj_axes_geom, lineMaterial, THREE.LinePieces);
    return axis;
}

function init() {

    // -------------------------------------------
    // Load vs proto
    protobuf.load("vs.proto", function(err, root) {
        if (err)
            throw err;
        
        // Obtain a message type
        message_t = root.lookupType("vs.message_t");
        pose_t = root.lookupType("vs.pose_t");
        obj_collection_t = root.lookupType("vs.obj_collection_t");
        point3d_list_collection_t = root.lookupType("vs.point3d_list_collection_t");
        
    });

    // -------------------------------------------
    // Connect to Web Socket
    ws = new WebSocket("ws://localhost:9001/");
    ws.binaryType = 'arraybuffer';
    
    ws.onmessage = function(e) {
        if (e.data instanceof ArrayBuffer) {
            // Create buffer
            buf = new Uint8Array(e.data);
            
            // Split channel, and data
            msg_buf = split_channel_data(buf);
            ch_str = String.fromCharCode.apply(null, msg_buf.channel);

            // Decode based on channel 
            switch(ch_str) {
            case 'CAMERA_POSE':
                msg = pose_t.decode(msg_buf.data);
                update_camera_pose(msg);
                break;
                
            case 'POINTS_COLLECTION':
                msg = point3d_list_collection_t.decode(msg_buf.data);
                add_points_to_scene_group(msg);
                break;
                
            case 'OBJ_COLLECTION':
                msg = obj_collection_t.decode(msg_buf.data);
                add_objects_to_scene_group(msg);
                break;
                
            case 'RESET_COLLECTIONS':
                console.log('<' + ch_str + '>');
                
                // // Clean up point clouds
                // // Tuple (element_group, point_cloud)
                // for (var msg_id in obj_collections) {
                //     for (var key in pc_obj_lut[msg_id]) {
                //         gp_pc = pc_obj_lut[msg_id][key];
                //         gp_pc[0].remove(gp_pc[1]);
                //     }
                //     delete pc_obj_lut[msg_id];
                // }
                pc_obj_lut = {};
                obj_collections = {};
                
                // Recursively delete all objects in the scene graph
                scene_group.traverse(function(child){
                    if (child.geometry != undefined) {
                        child.material.dispose();
                        child.geometry.dispose();
                    }
                });

                // Remove scene group
                scene.remove(scene_group);
                addEmptyScene();
                
                break;
                
            case 'RECORD_START':
                // location = msg_buf.data;
                
                // Create a capturer that exports a WebM video
                capturer = new CCapture(
                    { framerate: 30, format: 'webm', verbose: true }
                );
                capturer.start();
                break;

            case 'RECORD_STOP':
                // location = msg_buf.data;
                capturer.stop();
                capturer.save();
                capturer = null;
                break;
                
            default:
                console.log('Unknown channel / decoder ' + ch_str);
            }
            
            // Re-render scene
            render();
            
        }
    };
    
    ws.onclose = function() {
        // output("onclose");
    };
    
    ws.onerror = function(e) {
        // output("onerror");
        console.log(e)
    };

    // initialize renderer
    initRenderer();

    // TODO: Image viewer (see onionmaps reference)
    
}

function addEmptyScene() {
    // Create scene group
    scene_group = new THREE.Object3D();
    scene_group.name = 'collections_scene';
    scene.add(scene_group);
}

function initRenderer() {
    raycaster = new THREE.Raycaster();
    raycaster.precision = 0.01;

    // TODO: optional preserveDrawingBuffer: true
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor( 0x202020, 0.0);
    // renderer.sortObjects = false;

    container = document.getElementById( 'ThreeJS' );
    container.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(
        70, window.innerWidth / window.innerHeight, 0.03, 10000);
    camera.position.x = 50;
    camera.position.y = 50;
    camera.position.z = 50;
    camera.far = 200; // Setting far frustum (for culling)
    camera.up = new THREE.Vector3(0,0,1);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.addEventListener('change', render);

    window
        .addEventListener(
            'resize', onWindowResize, false);
    renderer.domElement
        .addEventListener(
            'mousemove', onDocumentMouseMove, false);
    renderer.domElement
        .addEventListener(
            'mousedown', onDocumentMouseDown, false);
    window
        .addEventListener( 'keydown', onKeyDown, false );
    
    // Set materials
    pointCloudMaterial = new THREE.PointsMaterial({
        size: options.pointSize,
        vertexColors: true,
    });
    lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 1,
        linewidth: 3,
        vertexColors: THREE.VertexColors
    });
    

    // // Image plane
    // imagePlaneCamera = camera_lines[0];
    // var shot = imagePlaneCamera.reconstruction.shots[imagePlaneCamera.shot_id];
    // var cam = imagePlaneCamera.reconstruction.cameras[shot.camera];

    // imagePlane = new THREE.Mesh(imagePlaneGeo(imagePlaneCamera.reconstruction,
    //                                           imagePlaneCamera.shot_id),
    //                             createImagePlaneMaterial(cam, shot, imagePlaneCamera.shot_id));
    // imagePlane.visible = options.showImagePlane;

    // imagePlaneCameraOld = camera_lines[0];
    // imagePlaneOld = new THREE.Mesh(imagePlaneGeo(imagePlaneCameraOld.reconstruction,
    //                                              imagePlaneCameraOld.shot_id),
    //                             createImagePlaneMaterial(cam, shot, imagePlaneCameraOld.shot_id));
    // imagePlaneOld.visible = options.showImagePlane;

    // scene_group.add(imagePlane);
    // scene_group.add(imagePlaneOld);

    // Axis
    grid_group = new THREE.Object3D();
    addGridAxes(); // grid_group.add(getAxes(1));

    // Ground grid
    {
        var linegeo = new THREE.Geometry();
        var N = 50;
        var scale = 5;
        for (var i = 0; i <= 2 * N; ++i) {
            linegeo.vertices.push(
                new THREE.Vector3(scale * (i - N), scale * (-N), 0),
                new THREE.Vector3(scale * (i - N), scale * ( N), 0),
                new THREE.Vector3(scale * (-N), scale * (i - N), 0),
                new THREE.Vector3(scale * ( N), scale * (i - N), 0)
            );
        }
        var lmaterial = new THREE.LineBasicMaterial({color:
                                                        0x555555});
        var line = new THREE.LineSegments(
            linegeo, lmaterial,
            THREE.LinePieces);
        // line.receiveShadow = true;
        grid_group.add(line);
    }
    grid_group.name = 'grid';
    grid_group.frustumCulled = true;

    scene = new THREE.Scene();
    scene.add(grid_group);

    // Create empty scene
    addEmptyScene();

    // Add controls
    addDatGui();

    // setShowThumbnail(true);
    // if ('img' in urlParams) {
    //     for (var i = 0; i < camera_lines.length; ++i) {
    //         if (camera_lines[i].shot_id.indexOf(urlParams.img) > -1) {
    //             var initialCamera = camera_lines[i];
    //             setMovingMode('walk');
    //             setImagePlaneCamera(initialCamera);
    //             navigateToShot(initialCamera);
    //             break;
    //         }
    //     }
    // }

    // if (camera_lines.length < 50) {
    //     preloadAllImages();
    // }

    render();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
}

function onDocumentMouseMove(event) {
    event.preventDefault();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
    render();
}

function reconstruction_of_shot(reconstructions, shot_id) {
    for (var r = 0; r < reconstructions.length; ++r) {
        if (shot_id in reconstructions[r]['shots']) {
            return reconstructions[r];
        }
    }
    return undefined;
}

function reconstruction_id_of_shot(reconstructions, shot_id) {
    for (var r = 0; r < reconstructions.length; ++r) {
        if (shot_id in reconstructions[r]['shots']) {
            return r;
        }
    }
    return undefined;
}

function setSelectedCamera(cameraObject) {
    var r = cameraObject.reconstruction;
    var shot_id = cameraObject.shot_id;
    var shot = r['shots'][shot_id];
    var image_url = imageURL(shot_id);
    if (selectedCamera !== undefined) {
        selectedCamera.material.linewidth = 1;
        selectedCamera.material.color = options.cameraColor;
    }
    selectedCamera = cameraObject;
    selectedCamera.material.linewidth = 5;
    selectedCamera.material.color = options.selectedCameraColor;
    var image_tag = document.getElementById('image');
    image_tag.src = image_url;
    var text = document.getElementById('text');
    text.innerHTML = shot_id;

    invokeJourneyWrapper(function () { journeyWrapper.showPath(); });
}

function setImagePlaneCamera(cameraObject) {
    var r = cameraObject.reconstruction;
    var shot_id = cameraObject.shot_id;
    var shot = r['shots'][shot_id];
    var cam = r['cameras'][shot['camera']];

    if (previousShot !== cameraObject.shot_id) {
        previousShot = cameraObject.shot_id
        var image_url = imageURL(shot_id);
        if (selectedCamera !== cameraObject) {
            setSelectedCamera(cameraObject);
        }

        if (imagePlaneCamera !== undefined) {
            if (imagePlaneCameraOld === undefined || imagePlaneCamera.shot_id !== cameraObject.shot_id) {
                imagePlaneCameraOld = imagePlaneCamera;
                imagePlaneOld.material.uniforms.projectorTex.value = imagePlane.material.uniforms.projectorTex.value;
                imagePlaneOld.material.uniforms.projectorMat.value = imagePlane.material.uniforms.projectorMat.value;
                imagePlane.material.uniforms.focal.value = imagePlane.material.uniforms.focal.value;
                imagePlane.material.uniforms.k1.value = imagePlane.material.uniforms.k1.value;
                imagePlane.material.uniforms.k2.value = imagePlane.material.uniforms.k2.value;
                imagePlane.material.uniforms.scale_x.value = imagePlane.material.uniforms.scale_x.value;
                imagePlane.material.uniforms.scale_y.value = imagePlane.material.uniforms.scale_y.value;
                imagePlaneOld.material.vertexShader = imagePlane.material.vertexShader;
                imagePlaneOld.material.fragmentShader = imagePlane.material.fragmentShader;
                imagePlaneOld.material.needsUpdate = true;

                imagePlaneOld.geometry.dispose();
                imagePlaneOld.geometry = imagePlaneGeo(imagePlaneCameraOld.reconstruction, imagePlaneCameraOld.shot_id);
            }

            if (movingMode === 'walk') {
                options.imagePlaneOpacity = 1;
            }
        }

        imagePlaneCamera = cameraObject;
        imagePlane.material.dispose();
        imagePlane.geometry.dispose();
        imagePlane.material = createImagePlaneMaterial(cam, shot, shot_id);
        imagePlane.geometry = imagePlaneGeo(r, shot_id);
    }
}

function setImagePlaneCameraList(cameraObject, id) {
    var r = cameraObject.reconstruction;
    var shot_id = cameraObject.shot_id;
    var shot = r['shots'][shot_id];
    var cam = r['cameras'][shot['camera']];
    var image_url = imageURL(shot_id);

    imagePlaneCameras[id] = cameraObject;
    imageMaterials[id].map = THREE.ImageUtils.loadTexture(image_url, null, render);
    imageMaterials[id].map.minFilter = THREE.LinearFilter;
    imagePlanes[id].geometry = imagePlaneGeo(r, shot_id);
    imagePlanes[id].visible = true;
}

function onDocumentMouseDown(event) {
    window.focus();
    if (hoverCamera !== undefined) {
        if (movingMode !== 'walk') {
            if (selectedCamera !== hoverCamera) {
                setSelectedCamera(hoverCamera);
                setImagePlaneCamera(hoverCamera);
            } else {
                setMovingMode('walk');
                setImagePlaneCamera(selectedCamera);
                navigateToShot(selectedCamera);
            }
        }
        render();
    }
}

function navigateToShot(camera) {
    var reconstruction = camera.reconstruction;
    var shot = reconstruction['shots'][camera.shot_id];
    var cam = reconstruction['cameras'][shot['camera']];
    controls.goto_shot(cam, shot);
}

function hideImagePlanesList(){
    for (var i =0; i < num_preview_plane; ++i) {
        imagePlanes[i].visible = false;
    }
}

function angleBetweenVector2(x1, y1, x2, y2) {
    var a = Math.atan2(y2, x2) - Math.atan2(y1, x1);
    if (a > Math.PI) return a - 2 * Math.PI;
    else if (a < -Math.PI) return a + 2 * Math.PI;
    else return a;
}

// function computeValidMoves() {
//     var currentPosition = controls.animationPosition;
//     var currentTarget = controls.animationTarget;
//     var currentDir = currentTarget.clone().sub(currentPosition);
//     var turnAngle = undefined;

//     var wantedMotionDirs = {
//         STEP_LEFT: new THREE.Vector3(-currentDir.y, currentDir.x, 0),
//         STEP_RIGHT: new THREE.Vector3(currentDir.y, -currentDir.x, 0),
//         STEP_FORWARD: new THREE.Vector3(currentDir.x, currentDir.y, 0),
//         STEP_BACKWARD: new THREE.Vector3(-currentDir.x, -currentDir.y, 0),
//         TURN_LEFT: new THREE.Vector3(0, 0, 0),
//         TURN_RIGHT: new THREE.Vector3(0, 0, 0),
//         TURN_U: new THREE.Vector3(0, 0, 0)
//     }

//     var wantedDirs = {
//         STEP_LEFT: new THREE.Vector3(currentDir.x, currentDir.y, 0),
//         STEP_RIGHT: new THREE.Vector3(currentDir.x, currentDir.y, 0),
//         STEP_FORWARD: new THREE.Vector3(currentDir.x, currentDir.y, 0),
//         STEP_BACKWARD: new THREE.Vector3(currentDir.x, currentDir.y, 0),
//         TURN_LEFT: new THREE.Vector3(-currentDir.y, currentDir.x, 0),
//         TURN_RIGHT: new THREE.Vector3(currentDir.y, -currentDir.x, 0),
//         TURN_U: new THREE.Vector3(-currentDir.x, -currentDir.y, 0)
//     }

//     var min_d = {};
//     var closest_line = {};
//     var turn_threshold;
//     for (var k in wantedMotionDirs) {
//         if (wantedMotionDirs.hasOwnProperty(k)) {
//             min_d[k] = 999999999999;
//             closest_line[k] = undefined;
//         }
//     }

//     for (var i = 0; i < camera_lines.length; ++i) {
//         var line = camera_lines[i];
//         var r = line.reconstruction;
//         var shot_id = line.shot_id;
//         var shot = r['shots'][shot_id];
//         var oc = opticalCenter(shot);
//         var dir = viewingDirection(shot);
//         var motion = oc.clone().sub(currentPosition);
//         var d = currentPosition.distanceTo(oc);
//         var rid = reconstruction_id_of_shot(reconstructions, shot_id);
//         var visible = options.reconstruction_visibles[rid];
//         if (!visible) continue;

//         for (var k in wantedMotionDirs) {
//             if (wantedMotionDirs.hasOwnProperty(k)) {
//                 var turn = angleBetweenVector2(wantedDirs[k].x, wantedDirs[k].y, dir.x, dir.y);
//                 var driftAB = angleBetweenVector2(wantedMotionDirs[k].x, wantedMotionDirs[k].y, motion.x, motion.y);
//                 var driftBA = driftAB - turn;
//                 var drift = Math.max(driftAB, driftBA);
//                 if (k.lastIndexOf('STEP', 0) === 0) {
//                     turn_threshold = 0.5
//                     if (Math.abs(turn) < turn_threshold && Math.abs(drift) < 0.5 && d > 0.01 && d < 20) {
//                         if (d < min_d[k]) {
//                             min_d[k] = d;
//                             closest_line[k] = line;
//                         }
//                     }
//                 } else if (k.lastIndexOf('TURN', 0) === 0) {
//                     if (Math.abs(turn) < 0.7 && d < 15) {
//                         if (d < min_d[k]) {
//                             min_d[k] = d;
//                             closest_line[k] = line;
//                         }
//                     }
//                 }
//             }
//         }
//     }
//     return closest_line;
// }

function walkOneStep(motion_type) {
    var line = validMoves[motion_type];
    if (line !== undefined) {
        setImagePlaneCamera(line);
        navigateToShot(line);
    }

    invokeJourneyWrapper(function () { journeyWrapper.stop(); });
}

function onKeyDown(event) {
    if (movingMode == 'walk') {
        var validKey = true;

        switch (event.keyCode) {
        case 37: // left arrow
            if (event.shiftKey) {
                walkOneStep('TURN_LEFT');
            } else {
                walkOneStep('STEP_LEFT');
            }
            break;
        case 38: // up arrow
            walkOneStep('STEP_FORWARD');
            break;
        case 39: // right arrow
            if (event.shiftKey) {
                walkOneStep('TURN_RIGHT');
            } else {
                walkOneStep('STEP_RIGHT');
            }
            break;
        case 40: // down arrow
            if (event.shiftKey) {
                walkOneStep('TURN_U');
            } else {
                walkOneStep('STEP_BACKWARD');
            }
            break;
        case 27: // ESC
            setMovingMode('orbit');
            break;
        case 83: // S
            invokeJourneyWrapper(function () { journeyWrapper.toggle(); });
        default:
            validKey = false;
            break;
        }

        if (validKey) {
            event.preventDefault();
        }
    }
}

function preloadAllImages() {
    for (var i = 0; i < camera_lines.length; ++i) {
        var shot_id = camera_lines[i].shot_id;
        var image_url = imageURL(shot_id);
        var temp_img = new Image();
        temp_img.src = image_url;
    }
}

// function preloadValidMoves() {
//     for (var k in validMoves) {
//         if (validMoves.hasOwnProperty(k)) {
//             var line = validMoves[k];
//             if (line !== undefined) {
//                 var shot_id = line.shot_id;
//                 var image_url = imageURL(shot_id);
//                 var temp_img = new Image();
//                 temp_img.src = image_url;
//             }
//         }
//     }
// }

// function updateValidMovesWidget() {
//     $('#nav-left').css('visibility',
//                        (validMoves.STEP_LEFT === undefined) ? 'hidden':'visible');
//     $('#nav-right').css('visibility',
//                         (validMoves.STEP_RIGHT === undefined) ? 'hidden':'visible');
//     $('#nav-forward').css('visibility',
//                           (validMoves.STEP_FORWARD === undefined) ? 'hidden':'visible');
//     $('#nav-backward').css('visibility',
//                            (validMoves.STEP_BACKWARD === undefined) ? 'hidden':'visible');
//     $('#nav-turn-left').css('visibility',
//                             (validMoves.TURN_LEFT === undefined) ? 'hidden':'visible');
//     $('#nav-turn-right').css('visibility',
//                              (validMoves.TURN_RIGHT === undefined) ? 'hidden':'visible');
//     $('#nav-u-turn').css('visibility',
//                          (validMoves.TURN_U === undefined) ? 'hidden':'visible');
// }

function animate() {
    requestAnimationFrame(animate);
    // imagePlane.material.uniforms.opacity.value = 1 - options.imagePlaneOpacity;
    if (imagePlaneOld !== undefined) {
        imagePlaneOld.material.uniforms.opacity.value = 1;
    }
    if (invokeJourneyWrapper(function () { return journeyWrapper.isStarted() && journeyWrapper.isSmooth(); }) !== true) {
        options.imagePlaneOpacity *= 1 - options.animationSpeed;
    }

    controls.update();
}

function render() {
    // validMoves = computeValidMoves();
    // updateValidMovesWidget();
    // if (invokeJourneyWrapper(function () { return journeyWrapper.isStarted(); }) !== true) {
    //     preloadValidMoves();
    // }

    // // Handle camera selection.
    // if (hoverCamera !== undefined && hoverCamera !== selectedCamera) {
    //     hoverCamera.material.linewidth = 1;
    //     hoverCamera.material.color = options.cameraColor;
    // }
    // var vector = new THREE.Vector3(mouse.x, mouse.y, 1).unproject(camera);
    // raycaster.set(camera.position, vector.sub(camera.position).normalize());
    // var intersects = raycaster.intersectObjects(camera_lines, true);
    // hoverCamera = undefined;
    // for (var i = 0; i < intersects.length; ++i) {
    //     if (intersects[i].distance > 1.5 * options.cameraSize
    //         && intersects[i].object.visible) {
    //         hoverCamera = intersects[i].object;
    //         if (hoverCamera !== selectedCamera) {
    //             hoverCamera.material.linewidth = 2;
    //             hoverCamera.material.color = options.hoverCameraColor;
    //         }
    //         break;
    //     }
    // }

    // Render.
    renderer.render(scene, camera);

    // Capture canvas
    // if( capturer )
    //     capturer.capture( renderer.domElement );

}
